"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Imovel } from "@/lib/types";
import { avaliarPadrao, calcular, custosPara, CUSTOS_PADRAO, FONTE_LABEL, MODALIDADE_LABEL, type Custos } from "@/lib/motor";
import { brl, brlCurto, pct, dataBR } from "@/lib/fmt";
import { usePadroes } from "@/lib/usePadroes";
import { urgencia, mapsUrl, tituloLimpo } from "@/lib/util";
import { useFavoritos } from "@/lib/favoritos";
import { useAcompanhar } from "@/lib/acompanhar";
import { useConta } from "@/lib/conta";
import { chaveDe, emSegundoPlano } from "@/lib/nuvem";
import { contato, MARCA } from "@/lib/marca";
import { useT } from "@/lib/i18n/client";
import type { T } from "@/lib/i18n";
import Regua from "./Regua";
import CampoMoeda from "./CampoMoeda";
import { IArea, ICama, ICarro, ICasa, IChave, IDoc, IEstrela, IMapa, IRelogio } from "./Icones";

// Link da fonte só sai como href quando é http(s): dado do catálogo com "javascript:" viraria XSS.
const httpOk = (u?: string | null): u is string => typeof u === "string" && (u.startsWith("http://") || u.startsWith("https://"));



interface AnaliseIA { resumo: string; risco_geral: "baixo" | "medio" | "alto" | "veto"; proprietario?: string; onus: string[]; alertas: string[]; ok: string[]; perguntas: string[]; custos_previstos?: string[] }
const RISCO_TXT: Record<AnaliseIA["risco_geral"], string> = { baixo: "baixo", medio: "médio", alto: "alto", veto: "veto" };
const CAMPOS: [keyof Custos, string][] = [["leiloeiro", "Leiloeiro %"], ["itbi", "ITBI %"], ["registro", "Registro %"], ["advogado", "Advogado R$"], ["certidoes", "Certidões R$"], ["debitos", "Débitos R$"], ["desocupacao", "Desocupação R$"], ["reforma", "Reforma R$"], ["meses", "Meses até vender"], ["mensal", "Custo mensal R$"], ["corretagem", "Corretagem %"], ["ir", "IR ganho capital %"], ["descontoVenda", "Vender abaixo da aval. %"]];

function PainelSemPadrao({ visitante }: { visitante: boolean }) {
  const { t } = useT();
  const volta = typeof location !== "undefined" ? location.pathname : "/app/buscar";
  return (
    <section className="secao" id="valores">
      <div className="vazio portao">
        <b>{visitante ? t("A análise completa é para quem tem conta") : t("A análise usa as suas regras")}</b>
        {visitante ? t("Conta grátis: você define o seu padrão (faixa, deságio, margem, região, vetos e custos) e cada lote ganha lance máximo, margem líquida, score e sinais de risco.")
          : t("Crie o seu padrão para ver o lance máximo, a margem líquida, o score e os sinais de risco deste lote. Leva 2 minutos e vale para o catálogo inteiro.")}
        <p style={{ margin: "16px 0 0", display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
          {visitante ? <><Link href={`/entrar?modo=criar&next=${encodeURIComponent(volta)}`} className="btn ouro">{t("Criar conta grátis")}</Link><Link href={`/entrar?next=${encodeURIComponent(volta)}`} className="btn sec">{t("Já tenho conta")}</Link></>
            : <Link href="/app/padrao?novo=1" className="btn ouro">{t("Criar meu padrão")}</Link>}
        </p>
      </div>
    </section>);
}

/** Lance inicial com o deságio: a barra preenchida é a fração do valor de avaliação que sai do bolso. */
function Desagio({ lance, avaliacao, desagio, compacto, t }: { lance: number; avaliacao: number; desagio?: number; compacto?: boolean; t: T }) {
  const d = desagio && desagio > 0 ? desagio : avaliacao > 0 && lance > 0 ? 1 - lance / avaliacao : 0;
  const temBarra = d > 0 && d < 1;
  return (
    <div className={`desagio ${compacto ? "compacto" : ""}`}>
      <p className="dg-rot">{t("Lance inicial")}</p>
      <div className="dg-lin">
        <b className="num dg-v">{brl(lance)}</b>
        {temBarra && <span className="dg-selo">&minus;{pct(d)}</span>}
      </div>
      {temBarra && <div className="dg-trilho" aria-hidden><i style={{ width: `${Math.max(4, Math.round((1 - d) * 100))}%` }} /></div>}
      {avaliacao > 0 && <p className="dg-pe">{t("avaliação da fonte")} <b className="num">{brl(avaliacao)}</b></p>}
    </div>
  );
}

export default function Lote({ imovel: i }: { imovel: Imovel }) {
  const { t, lang } = useT();
  const locale = lang === "en" ? "en-US" : "pt-BR";
  const ex = i as Imovel & { lance_1a_praca?: number; lance_2a_praca?: number; datas_leilao?: Record<string, string>; formas_pagamento?: string; edital_num?: string; inscricao_imobiliaria?: string; descricao_detalhe?: string };
  const { ativo, pronto: padroesProntos } = usePadroes();
  // Sem padrão não há análise: a página mostra o lote e pede as regras do usuário (ou a conta, se for visitante).
  const regras = ativo;
  const [custos, setCustos] = useState<Custos>(() => custosPara(i, ativo?.custos ?? CUSTOS_PADRAO));
  const [lance, setLance] = useState(i.lance_minimo);
  const [venda, setVenda] = useState(i.avaliacao);
  const [ia, setIa] = useState<AnaliseIA | null>(null);
  const [erro, setErro] = useState(""); const [carregando, setCarregando] = useState(false); const [arrasto, setArrasto] = useState(false);
  const [foto, setFoto] = useState(0); const [zoom, setZoom] = useState(false); const [abrirCustos, setAbrirCustos] = useState(false);
  const { favs, toggle } = useFavoritos(); const fav = favs.has(i.id);
  const { segue, toggle: toggleAcomp } = useAcompanhar(); const acomp = segue(i.id);
  const { user, sb, pronto: contaPronta } = useConta(); const uid = user?.id;
  const visitante = contaPronta && !user; const semPadrao = padroesProntos && contaPronta && !regras;
  const chave = chaveDe(`garimpo:${i.id}`, uid);

  const aplicar = (d: Partial<{ custos: Custos; lance: number; venda: number; ia: AnaliseIA }>) => { d.custos && setCustos(d.custos); d.lance && setLance(d.lance); d.venda && setVenda(d.venda); d.ia && setIa(d.ia); };
  useEffect(() => { try { const s = localStorage.getItem(chave); if (s) aplicar(JSON.parse(s)); } catch {} }, [chave]);
  // Logado: se este navegador não tem nada do lote, usa o que está na nuvem.
  useEffect(() => {
    if (!uid || !sb) return; let vivo = true;
    sb.from("lotwise_lotes").select("dados").eq("lote_id", i.id).maybeSingle().then(({ data }) => { if (vivo && data?.dados && !localStorage.getItem(chave)) aplicar(data.dados as Parameters<typeof aplicar>[0]); });
    return () => { vivo = false; };
  }, [uid, sb, i.id, chave]);
  useEffect(() => {
    const dados = { custos, lance, venda, ia };
    try { localStorage.setItem(chave, JSON.stringify(dados)); } catch {}
    if (!uid || !sb) return;
    const timer = setTimeout(() => emSegundoPlano(sb.from("lotwise_lotes").upsert({ lote_id: i.id, dados })), 900);
    return () => clearTimeout(timer);
  }, [chave, custos, lance, venda, ia, uid, sb, i.id]);

  const fotos = i.fotos ?? [];
  const res = useMemo(() => calcular(venda, lance, custos), [venda, lance, custos]);
  const av = useMemo(() => (regras ? avaliarPadrao(i, regras, t) : null), [i, regras, t]);
  const u = urgencia(i.data_leilao, t);
  const veto = (av?.sinais.some((s) => s.nivel === "veto") ?? false) || ia?.risco_geral === "veto";
  const margemMin = regras?.margemMin ?? 0, margemAlvo = regras?.margemAlvo ?? 0.3;
  const classe = veto ? "nogo" : res.lucro <= 0 || res.margem < margemMin ? "nogo" : res.margem < margemAlvo ? "atencao" : "go";
  const endCompleto = [i.endereco, i.bairro, i.cidade, i.uf, i.cep].filter(Boolean).join(", ");
  const alvoPct = pct(margemAlvo);
  const lanceAlvo = margemAlvo >= 0.35 ? res.lanceMax35 : margemAlvo >= 0.3 ? res.lanceMax30 : res.lanceMax25;

  const irFoto = useCallback((d: number) => setFoto((f) => (fotos.length ? (f + d + fotos.length) % fotos.length : 0)), [fotos.length]);
  useEffect(() => {
    if (!zoom) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setZoom(false); if (e.key === "ArrowRight") irFoto(1); if (e.key === "ArrowLeft") irFoto(-1); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [zoom, irFoto]);
  const [tx, setTx] = useState<number | null>(null);

  async function analisar(file: File) {
    setErro(""); setCarregando(true);
    try {
      const fd = new FormData(); fd.append("file", file);
      fd.append("contexto", JSON.stringify({ titulo: i.titulo, endereco: i.endereco, cidade: i.cidade, modalidade: i.modalidade, matricula: i.matricula, cartorio: i.cartorio, debitos_regra: i.debitos_regra, descricao: i.descricao?.slice(0, 3000) }));
      const r = await fetch("/api/matricula", { method: "POST", body: fd });
      if (!r.ok) throw new Error(await r.text());
      setIa(await r.json());
    } catch (e) { setErro(String((e as Error).message || e)); } finally { setCarregando(false); }
  }

  const linhas: [string, React.ReactNode][] = ([
    [t("Matrícula"), i.matricula ? <span className="mono">{i.matricula}</span> : null],
    [t("Cartório"), i.cartorio],
    [t("Inscrição"), ex.inscricao_imobiliaria ? <span className="mono">{ex.inscricao_imobiliaria}</span> : null],
    [t("Área privativa"), i.area_privativa_m2 ? t("{v} m²", { v: i.area_privativa_m2.toLocaleString(locale) }) : null],
    [t("Terreno"), i.area_terreno_m2 ? t("{v} m²", { v: i.area_terreno_m2.toLocaleString(locale) }) : null],
    [t("Financiamento"), i.aceita_financiamento === true ? t("Aceita") : i.aceita_financiamento === false ? t("Não aceita") : null],
    ["FGTS", i.aceita_fgts === true ? t("Aceita") : i.aceita_fgts === false ? t("Não aceita") : null],
    [t("Pagamento"), ex.formas_pagamento],
    [t("Débitos"), i.debitos_regra],
    [t("Edital"), ex.edital_num],
    [t("Leiloeiro"), i.leiloeiro],
  ] as [string, React.ReactNode][]).filter(([, v]) => v !== null && v !== undefined && v !== "");

  return (
    <>
      <div className="lote-barra">
        <Link href="/app/buscar" className="volta">← {t("Voltar à busca")}</Link>
        <div className="lote-acoes">
          <button className={`btn sec ${fav ? "favon" : ""}`} onClick={() => (visitante ? (location.href = `/entrar?next=${encodeURIComponent(location.pathname)}`) : toggle(i.id))} aria-pressed={fav}><IEstrela cheia={fav} />{fav ? t("Guardado") : t("Guardar")}</button>
          <button className={`btn sec ${acomp ? "favon" : ""}`} onClick={() => (visitante ? (location.href = `/entrar?next=${encodeURIComponent(location.pathname)}`) : toggleAcomp(i.id))} aria-pressed={acomp} title={t("Conferir lance, data e situação direto na fonte")}><IRelogio />{acomp ? t("Acompanhando") : t("Acompanhar")}</button>
          {endCompleto && <a className="btn sec" href={mapsUrl(endCompleto)} target="_blank" rel="noreferrer"><IMapa />{t("Ver no mapa")}</a>}
          {httpOk(i.matricula_url) && <a className="btn sec" href={i.matricula_url} target="_blank" rel="noreferrer"><IDoc />{t("Matrícula")}</a>}
          {httpOk(i.edital_url) && <a className="btn sec" href={i.edital_url} target="_blank" rel="noreferrer"><IDoc />{t("Edital")}</a>}
          {httpOk(i.url) && <a className="btn" href={i.url} target="_blank" rel="noreferrer">{t("Abrir na fonte")} ↗</a>}
        </div>
      </div>

      <div className="lote-grid">
        <div>
          {/* Galeria */}
          {fotos.length === 0 ? <div className="galeria-vazia">{t(i.tipo)} · {t("a fonte não publicou fotos")}</div> : (
            <div className={`galeria2 ${fotos.length === 1 ? "uma" : ""}`}>
              <button className="g-principal" onClick={() => setZoom(true)} aria-label={t("Ampliar foto")}><img src={fotos[foto]} alt={i.titulo} referrerPolicy="no-referrer" />{fotos.length > 1 && <span className="g-conta">{foto + 1} / {fotos.length}</span>}</button>
              {fotos.length > 1 && (
                <div className="g-lado">
                  {fotos.slice(0, 4).map((f, k) => <button key={f + k} className={`g-thumb ${k === foto ? "on" : ""}`} onClick={() => setFoto(k)} aria-label={t("Foto {n}", { n: k + 1 })}><img src={f} alt="" referrerPolicy="no-referrer" />{k === 3 && fotos.length > 4 && <span className="g-mais" onClick={(e) => { e.stopPropagation(); setFoto(3); setZoom(true); }}>+{fotos.length - 4}</span>}</button>)}
                </div>)}
            </div>)}
          {zoom && fotos[foto] && (
            <div className="lightbox" onClick={() => setZoom(false)}
              onTouchStart={(e) => setTx(e.touches[0].clientX)}
              onTouchEnd={(e) => { if (tx !== null) { const d = e.changedTouches[0].clientX - tx; if (Math.abs(d) > 50) irFoto(d < 0 ? 1 : -1); } setTx(null); }}>
              <button className="lb-nav esq" onClick={(e) => { e.stopPropagation(); irFoto(-1); }} aria-label={t("Foto anterior")}>‹</button>
              <img src={fotos[foto]} alt="" referrerPolicy="no-referrer" onClick={(e) => e.stopPropagation()} />
              <button className="lb-nav dir" onClick={(e) => { e.stopPropagation(); irFoto(1); }} aria-label={t("Próxima foto")}>›</button>
              <span className="lb-conta">{t("{atual} de {total} · arraste ou use as setas", { atual: foto + 1, total: fotos.length })}</span>
              <button className="lb-fechar" onClick={() => setZoom(false)} aria-label={t("Fechar")}>✕</button>
            </div>)}

          <header className="lote-tit">
            <p className="lote-eyebrow">{FONTE_LABEL[i.fonte] ?? i.fonte}<span>·</span>{t(MODALIDADE_LABEL[i.modalidade])}{i.praca ? <><span>·</span>{t("{n}ª praça", { n: i.praca })}</> : null}</p>
            <h1>{tituloLimpo(i, t)}</h1>
            <p className="lote-end"><IMapa />{[i.endereco, i.bairro, `${i.cidade}/${i.uf}`].filter(Boolean).join(" · ")}</p>
          </header>

          {/* Ficha técnica: faixa contínua, só com o que a fonte publicou */}
          {(() => {
            const itens = ([
              { ic: <ICasa />, r: t("Tipo"), v: i.tipo ? t(i.tipo)[0].toUpperCase() + t(i.tipo).slice(1) : null },
              { ic: <IArea />, r: i.area_privativa_m2 ? t("Área útil") : t("Terreno"), v: i.area_privativa_m2 ? t("{v} m²", { v: i.area_privativa_m2.toLocaleString(locale) }) : i.area_terreno_m2 ? t("{v} m²", { v: i.area_terreno_m2.toLocaleString(locale) }) : null },
              { ic: <ICama />, r: t("Dormitórios"), v: i.quartos ?? null },
              { ic: <ICarro />, r: t("Vagas"), v: i.vagas ?? null },
              { ic: <IChave />, r: t("Ocupação"), v: i.ocupado === true ? t("Ocupado") : i.ocupado === false ? t("Desocupado") : null },
              { ic: <IRelogio />, r: i.praca ? t("{n}ª praça", { n: i.praca }) : t("Leilão"), v: i.data_leilao ? dataBR(i.data_leilao) : null },
            ]).filter((x) => x.v !== null && x.v !== undefined && x.v !== "");
            if (!itens.length) return null;
            return <div className="fichatec">{itens.map((x) => (
              <div className="ft-item" key={x.r}>
                <b>{x.v}</b>
                <span>{x.ic}{x.r}</span>
              </div>))}</div>;
          })()}

          <nav className="ancoras" aria-label={t("Seções")}>{!semPadrao && <><a href="#valores">{t("Valores")}</a><a href="#riscos">{t("Riscos")}</a></>}<a href="#documentos">{t("Documentos")}</a><a href="#descricao">{t("Descrição")}</a></nav>

          {semPadrao && <PainelSemPadrao visitante={visitante} />}

          {/* Parte 1 · Valores */}
          {!semPadrao && <section className="secao" id="valores">
            <h2><span className="parte">{t("Parte 1")}</span>{t("Valores")}</h2>
            <p className="lede">{t("Refizemos a conta com todos os custos. O número que importa é o teto: até quanto dá para dar lance mantendo a sua margem.")}</p>

            <div className="teto">
              <div className="teto-alvo">
                <span>{t("Lance máximo para {pct} de margem", { pct: alvoPct })}</span>
                <b className="num">{brl(lanceAlvo)}</b>
                <small>{lance <= lanceAlvo ? t("Seu lance atual está {v} abaixo do teto.", { v: brl(lanceAlvo - lance) }) : t("Atenção: seu lance passa {v} do teto.", { v: brl(lance - lanceAlvo) })}</small>
              </div>
              <div className="teto-outros">
                {([[0.25, res.lanceMax25], [0.30, res.lanceMax30], [0.35, res.lanceMax35]] as const).filter(([m]) => Math.abs(m - margemAlvo) > 0.001).map(([m, v]) => (
                  <div key={m}><span>{t("Teto para {pct}", { pct: pct(m) })}</span><b className="num" title={brl(v)}>{brlCurto(v)}</b></div>))}
              </div>
            </div>

            <div className="simular">
              <div className="campo"><span>{t("Se eu vender por")}</span><CampoMoeda valor={venda} onChange={setVenda} /></div>
              <div className="campo"><span>{t("e arrematar por")}</span><CampoMoeda valor={lance} onChange={setLance} /></div>
              <button className="btn sec" onClick={() => { setLance(Math.floor(lanceAlvo)); }}>{t("Usar o teto")}</button>
            </div>

            <div className="conta">
              <div className="conta-linha"><span>{t("Lance")}</span><b className="num">{brl(lance)}</b></div>
              <div className="conta-linha"><span>{t("Leiloeiro, ITBI e registro")} <small>{t("{pct}% sobre o lance", { pct: custos.leiloeiro + custos.itbi + custos.registro })}</small></span><b className="num">+ {brl(res.custosSobreLance)}</b></div>
              <div className="conta-linha"><span>{t("Advogado, certidões, débitos e carrego")} <small>{t("{n} meses", { n: custos.meses })}</small></span><b className="num">+ {brl(res.fixos)}</b></div>
              <div className="conta-linha total"><span>{t("Capital total empregado")}</span><b className="num">{brl(res.total)}</b></div>
              <div className="conta-linha"><span>{t("Venda líquida")} <small>{t("após {pct}% de corretagem", { pct: custos.corretagem })}</small></span><b className="num">{brl(res.receita)}</b></div>
              <div className="conta-linha"><span>{t("Imposto sobre o ganho")} <small>{custos.ir}%</small></span><b className="num">- {brl(Math.max(0, res.receita - res.total) * (custos.ir / 100))}</b></div>
              <div className={`conta-resultado ${classe}`}>
                <div><span>{t("Lucro líquido")}</span><b className="num">{brl(res.lucro)}</b></div>
                <div><span>{t("Margem sobre o capital")}</span><b className="num">{pct(res.margem)}</b></div>
                <div><span>{t("Deságio real")}</span><b className="num">{pct(Math.max(0, res.descReal))}</b></div>
              </div>
            </div>

            <details className="custos-det" open={abrirCustos} onToggle={(e) => setAbrirCustos((e.target as HTMLDetailsElement).open)}>
              <summary>{t("Ajustar os custos deste lote")}</summary>
              <div className="custos">{CAMPOS.map(([k, l]) => {
                const rotulo = t(l);
                return l.endsWith("R$")
                  ? <div className="campo" key={k}><span>{rotulo.replace(" R$", "")}</span><CampoMoeda valor={custos[k]} onChange={(v) => setCustos({ ...custos, [k]: v })} /></div>
                  : <label className="campo" key={k}><span>{rotulo}</span><input className="num" type="number" step="0.1" value={custos[k]} onChange={(e) => setCustos({ ...custos, [k]: +e.target.value || 0 })} /></label>;
              })}</div>
              <p style={{ margin: "12px 0 0" }}><button className="btn sec mini" onClick={() => { setCustos(custosPara(i, regras?.custos ?? CUSTOS_PADRAO)); setLance(i.lance_minimo); setVenda(i.avaliacao); }}>{t("Restaurar")}</button></p>
            </details>
          </section>}

          {/* Parte 2 · Riscos */}
          {!semPadrao && <section className="secao" id="riscos">
            <h2><span className="parte">{t("Parte 2")}</span>{t("Riscos")}</h2>
            <p className="lede">{t("O que a fonte e as suas regras já apontam. A leitura da matrícula fecha o resto.")}</p>
            {av && av.sinais.length === 0 && <div className="sinal">{t("Nenhum sinal automático neste lote. A diligência manual continua obrigatória.")}</div>}
            {av?.sinais.map((s, k) => <div key={k} className={`sinal ${s.nivel}`}>{s.texto}</div>)}

            <div className={`upload ${arrasto ? "ativo" : ""}`} onDragOver={(e) => { e.preventDefault(); setArrasto(true); }} onDragLeave={() => setArrasto(false)} onDrop={(e) => { e.preventDefault(); setArrasto(false); const f = e.dataTransfer.files?.[0]; if (f) analisar(f); }}>
              <p><b>{t("Análise da matrícula por IA.")}</b> {t("Arraste o PDF aqui ou")} <label className="link-arquivo">{t("escolha o arquivo")}<input type="file" accept="application/pdf" hidden disabled={carregando} onChange={(e) => e.target.files?.[0] && analisar(e.target.files[0])} /></label>.</p>
              <small>{carregando ? t("Lendo averbação por averbação…") : t("Devolve ônus, penhoras, alertas, custos previstos e o que perguntar antes do lance.")}</small>
              {httpOk(i.matricula_url) && !carregando && <div style={{ marginTop: 10 }}><a className="btn sec mini" href={i.matricula_url} target="_blank" rel="noreferrer">{t("Baixar a matrícula da fonte")}</a></div>}
            </div>
            {erro && <div className="sinal veto" style={{ marginTop: 10 }}>{erro}</div>}
            {ia && (
              <div className="analise">
                <div className={`sinal ${ia.risco_geral === "veto" || ia.risco_geral === "alto" ? "veto" : ia.risco_geral === "medio" ? "alerta" : "info"}`} style={{ marginTop: 14 }}><b>{t("Risco {r}.", { r: t(RISCO_TXT[ia.risco_geral]) })}</b> {ia.resumo}{ia.proprietario ? ` ${t("Proprietário atual: {v}.", { v: ia.proprietario })}` : ""}</div>
                {ia.onus.length > 0 && <><h4>{t("Ônus e gravames")}</h4><ul>{ia.onus.map((x, k) => <li key={k}>{x}</li>)}</ul></>}
                {ia.alertas.length > 0 && <><h4>{t("Alertas")}</h4><ul>{ia.alertas.map((x, k) => <li key={k}>{x}</li>)}</ul></>}
                {ia.custos_previstos && ia.custos_previstos.length > 0 && <><h4>{t("Custos previstos")}</h4><ul>{ia.custos_previstos.map((x, k) => <li key={k}>{x}</li>)}</ul></>}
                {ia.ok.length > 0 && <><h4>{t("Pontos positivos")}</h4><ul>{ia.ok.map((x, k) => <li key={k}>{x}</li>)}</ul></>}
                {ia.perguntas.length > 0 && <><h4>{t("Perguntar antes do lance")}</h4><ul>{ia.perguntas.map((x, k) => <li key={k}>{x}</li>)}</ul></>}
              </div>)}
          </section>}

          {/* Documentos */}
          <section className="secao" id="documentos">
            <h2>{t("Documentos e links")}</h2>
            <p className="lede">{t("Tudo que a fonte publicou sobre este lote.")}</p>
            <div className="docs">
              {httpOk(i.matricula_url) && <a href={i.matricula_url} target="_blank" rel="noreferrer"><IDoc />{t("Matrícula do imóvel (PDF)")}<small>{i.matricula ? t("nº {v}", { v: i.matricula }) : ""}</small></a>}
              {httpOk(i.edital_url) && <a href={i.edital_url} target="_blank" rel="noreferrer"><IDoc />{t("Edital do leilão (PDF)")}<small>{ex.edital_num ?? ""}</small></a>}
              {httpOk(i.url) && <a href={i.url} target="_blank" rel="noreferrer"><IDoc />{t("Página do lote em {fonte}", { fonte: FONTE_LABEL[i.fonte] ?? i.fonte })}<small>{t("abre em nova aba")}</small></a>}
              {endCompleto && <a href={mapsUrl(endCompleto)} target="_blank" rel="noreferrer"><IMapa />{t("Ver o endereço no Google Maps")}<small>{i.cidade}/{i.uf}</small></a>}
              {i.tambem_em?.filter((item) => httpOk(item.url)).map((item) => <a key={item.url} href={item.url} target="_blank" rel="noreferrer"><IDoc />{t("Mesmo lote em {fonte}", { fonte: FONTE_LABEL[item.fonte] ?? item.fonte })}<small>{brl(item.lance_minimo)}</small></a>)}
              {!i.matricula_url && !i.edital_url && <div className="sinal alerta">{t("A fonte não publicou matrícula nem edital. Peça os dois ao leiloeiro antes de qualquer lance.")}</div>}
            </div>
          </section>

          <section className="secao" id="descricao"><h2>{t("Descrição da fonte")}</h2><p className="lede">{t("Como o lote foi publicado por {fonte}.", { fonte: FONTE_LABEL[i.fonte] ?? i.fonte })}</p><p className="titulo-fonte">{i.titulo}</p>{(i.descricao || ex.descricao_detalhe) && <pre className="desc">{[ex.descricao_detalhe, i.descricao].filter(Boolean).join("\n\n")}</pre>}</section>
        </div>

        {/* Lateral */}
        <aside className="lateral">
          {semPadrao && <div className="cart destaque">
            <Desagio lance={i.lance_minimo} avaliacao={i.avaliacao} desagio={i.desagio_pct} t={t} />
          </div>}
          {!semPadrao && <div className="cart destaque">
            <div className={`sit ${classe}`}>
              <span className="sit-pill">{veto ? t("Não comprar") : classe === "go" ? t("Vale a pena") : classe === "atencao" ? t("Atenção") : t("Não vale a pena")}</span>
              <span className="sit-score">{av?.score ?? 0}<small>{t(" de 100")}</small></span>
            </div>
            <div className="cart-corpo">
              {veto ? <p className="v-nota" style={{ color: "var(--bad)" }}>{t("Este lote é vetado pelas suas regras. Não avance.")}</p> : (<>
                <div className="heroi">
                  <span>{t("Quanto sobra pra você, se vender pela avaliação")}</span>
                  <b className={`num ${classe}`}>{brl(res.lucro)}</b>
                  <small>{t("Isso é {pct} de retorno sobre os {total} que você põe no negócio (lance mais custos).", { pct: pct(res.margem), total: brl(res.total) })}</small>
                </div>
              </>)}
            </div>
            <div className="valores-lote">
              <Desagio compacto lance={i.lance_minimo} avaliacao={i.avaliacao} desagio={i.desagio_pct} t={t} />
            </div>
          </div>}

          <div className="cart">
            {!semPadrao && <><div className="cart-cab"><span>{t("Até quanto pagar")}</span></div>
            <div className="cart-corpo">
              <div className="heroi">
                <span>{t("Pague no máximo")}</span>
                <b className="num destaque-ouro">{brl(lanceAlvo)}</b>
                <small>{t("É o lance mais alto que ainda deixa {pct} de retorno pra você depois de todos os custos.", { pct: alvoPct })}</small>
              </div>
              <Regua grande minimo={i.lance_minimo} avaliacao={i.avaliacao} lance={lance} max25={res.lanceMax25} max30={res.lanceMax30} max35={res.lanceMax35} t={t} />
              <div className="teto-alt">
                {([[0.25, res.lanceMax25], [0.30, res.lanceMax30], [0.35, res.lanceMax35]] as const).filter(([m]) => Math.abs(m - margemAlvo) > 0.001).map(([m, v]) => (
                  <div key={m}><span>{t("Se aceitar {pct} de retorno", { pct: pct(m) })}</span><b className="num" title={brl(v)}>{brl(v)}</b></div>))}
              </div>
            </div></>}
            {(() => {
              const p1 = ex.lance_1a_praca ?? (i.praca === 1 ? i.lance_minimo : undefined);
              const p2 = ex.lance_2a_praca ?? (i.praca === 2 || !i.praca ? i.lance_minimo : undefined);
              const d1 = ex.datas_leilao?.["1"] ?? (i.praca === 1 ? i.data_leilao : undefined);
              const d2 = ex.datas_leilao?.["2"] ?? (i.praca !== 1 ? (i.data_leilao ?? i.data_fim) : undefined);
              const cols = [p1 !== undefined && { titulo: t("1ª praça"), v: p1, d: d1, on: i.praca === 1 }, p2 !== undefined && { titulo: t(i.praca ? "2ª praça" : "Lance mínimo"), v: p2, d: d2, on: i.praca !== 1 }].filter(Boolean) as { titulo: string; v: number; d?: string; on: boolean }[];
              if (!cols.length) return null;
              return <div className="cart-bloco">{cols.map((c) => (
                <div className={`praca-lin ${c.on ? "on" : ""}`} key={c.titulo}>
                  <span className="p-t">{c.titulo}{c.on && <i>{t("vigente")}</i>}</span>
                  <span className="p-v"><b className="num" title={brl(c.v)}>{brlCurto(c.v)}</b><small>{dataBR(c.d, { day: "2-digit", month: "short", year: "numeric" }) ?? t("sem data")}</small></span>
                </div>))}</div>;
            })()}
            {linhas.length > 0 && <dl className="linhas">{linhas.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>}
            <div className="cart-pe mono">{i.id} · {t("coletado {data}", { data: dataBR(i.coletado_em, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) ?? "" })}</div>
          </div>

          <div className="cta-lote">
            <b>{t("Quer arrematar com a conta pronta?")}</b>
            <p>{t("Lemos matrícula e edital, fechamos o lance máximo e acompanhamos o pregão. 3% só se você arrematar.")}</p>
            <a className="btn ouro" href={contato(t("Olá, quero assessoria da {marca} para o lote {titulo} ({cidade}/{uf}).", { marca: MARCA, titulo: i.titulo, cidade: i.cidade, uf: i.uf }))} target="_blank" rel="noreferrer">{t("Pedir assessoria neste lote")}</a>
          </div>
        </aside>
      </div>

      <Link href={`/app/sage?lote=${encodeURIComponent(i.id)}`} className="sage-flutuante" aria-label={t("Perguntar ao Sage sobre este lote")}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12a8 8 0 1 1 4.2 7L4 20l1-4.2A8 8 0 0 1 4 12z" /><path d="M9 11h6M9 14h4" /></svg>
        <span>{t("Perguntar ao Sage")}</span>
      </Link>
    </>
  );
}
