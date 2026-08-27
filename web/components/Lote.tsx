"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Imovel } from "@/lib/types";
import { avaliarPadrao, REGRAS_BASE, calcular, custosPara, CUSTOS_PADRAO, FONTE_LABEL, MODALIDADE_LABEL, type Custos } from "@/lib/motor";
import { brl, brlCurto, pct, dataBR } from "@/lib/fmt";
import { usePadroes } from "@/lib/usePadroes";
import { urgencia, mapsUrl } from "@/lib/util";
import { useFavoritos } from "@/lib/favoritos";
import { contato, MARCA } from "@/lib/marca";
import Regua from "./Regua";
import CampoMoeda from "./CampoMoeda";
import { IArea, ICama, ICarro, ICasa, IChave, IDoc, IEstrela, IMapa, IRelogio } from "./Icones";

const CHECKLIST = [
  ["Edital lido inteiro", "A regra de débitos e as condições de pagamento estão no edital. É ele que diz se o condomínio atrasado fica com você."],
  ["Matrícula atualizada (até 30 dias)", "Mostra dono, penhoras, hipotecas, execução condominial e cláusulas que podem anular o negócio."],
  ["Consolidação com intimação pessoal", "Em alienação fiduciária, intimação só por edital aumenta o risco de ação anulatória depois do arremate."],
  ["Não é direitos de fiduciante nem fração ideal", "Nos dois casos você não compra o imóvel: compra dívida ou um pedaço em condomínio com estranhos."],
  ["Débitos de condomínio confirmados com o síndico", "O valor real costuma ser maior que o publicado. Ligue e peça o extrato."],
  ["IPTU e dívida ativa consultados na prefeitura", "Em leilão judicial normalmente sub-roga no preço; em extrajudicial pode vir junto."],
  ["Valor de venda conferido com 3 comparáveis", "Avaliação de laudo costuma estar acima do preço de rua. Confira anúncios no entorno de 500 m a 1 km."],
  ["Ocupação verificada", "Imóvel ocupado custa tempo e advogado. Passe na porta, pergunte ao porteiro ou vizinho."],
  ["Custo de desocupação e reforma estimado", "Entra na conta antes do lance, não depois."],
  ["Lance máximo definido antes do pregão", "O erro mais caro do leilão é passar do teto no calor do lance."],
] as const;

interface AnaliseIA { resumo: string; risco_geral: "baixo" | "medio" | "alto" | "veto"; proprietario?: string; onus: string[]; alertas: string[]; ok: string[]; perguntas: string[]; custos_previstos?: string[] }
const CAMPOS: [keyof Custos, string][] = [["leiloeiro", "Leiloeiro %"], ["itbi", "ITBI %"], ["registro", "Registro %"], ["advogado", "Advogado R$"], ["certidoes", "Certidões R$"], ["debitos", "Débitos R$"], ["desocupacao", "Desocupação R$"], ["reforma", "Reforma R$"], ["meses", "Meses até vender"], ["mensal", "Custo mensal R$"], ["corretagem", "Corretagem %"], ["ir", "IR ganho capital %"], ["descontoVenda", "Vender abaixo da aval. %"]];

export default function Lote({ imovel: i }: { imovel: Imovel }) {
  const ex = i as Imovel & { lance_1a_praca?: number; lance_2a_praca?: number; datas_leilao?: Record<string, string>; formas_pagamento?: string; edital_num?: string; inscricao_imobiliaria?: string; descricao_detalhe?: string };
  const { ativo } = usePadroes();
  const regras = ativo ?? REGRAS_BASE;
  const [custos, setCustos] = useState<Custos>(() => custosPara(i, regras.custos ?? CUSTOS_PADRAO));
  const [lance, setLance] = useState(i.lance_minimo);
  const [venda, setVenda] = useState(i.avaliacao);
  const [checks, setChecks] = useState<boolean[]>(CHECKLIST.map(() => false));
  const [ia, setIa] = useState<AnaliseIA | null>(null);
  const [erro, setErro] = useState(""); const [carregando, setCarregando] = useState(false); const [arrasto, setArrasto] = useState(false);
  const [foto, setFoto] = useState(0); const [zoom, setZoom] = useState(false); const [abrirCustos, setAbrirCustos] = useState(false);
  const { favs, toggle } = useFavoritos(); const fav = favs.has(i.id);
  const chave = `garimpo:${i.id}`;

  useEffect(() => { try { const s = localStorage.getItem(chave); if (s) { const d = JSON.parse(s); d.custos && setCustos(d.custos); d.lance && setLance(d.lance); d.venda && setVenda(d.venda); d.checks && setChecks(d.checks); d.ia && setIa(d.ia); } } catch {} }, [chave]);
  useEffect(() => { try { localStorage.setItem(chave, JSON.stringify({ custos, lance, venda, checks, ia })); } catch {} }, [chave, custos, lance, venda, checks, ia]);

  const fotos = i.fotos ?? [];
  const res = useMemo(() => calcular(venda, lance, custos), [venda, lance, custos]);
  const av = useMemo(() => avaliarPadrao(i, regras), [i, regras]);
  const u = urgencia(i.data_leilao);
  const veto = av.sinais.some((s) => s.nivel === "veto") || ia?.risco_geral === "veto";
  const classe = veto ? "nogo" : res.lucro <= 0 || res.margem < regras.margemMin ? "nogo" : res.margem < regras.margemAlvo ? "atencao" : "go";
  const feitos = checks.filter(Boolean).length;
  const endCompleto = [i.endereco, i.bairro, i.cidade, i.uf, i.cep].filter(Boolean).join(", ");
  const alvoPct = pct(regras.margemAlvo);
  const lanceAlvo = regras.margemAlvo >= 0.35 ? res.lanceMax35 : regras.margemAlvo >= 0.3 ? res.lanceMax30 : res.lanceMax25;

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
    ["Matrícula", i.matricula ? <span className="mono">{i.matricula}</span> : null],
    ["Cartório", i.cartorio],
    ["Inscrição", ex.inscricao_imobiliaria ? <span className="mono">{ex.inscricao_imobiliaria}</span> : null],
    ["Área privativa", i.area_privativa_m2 ? `${i.area_privativa_m2} m²` : null],
    ["Terreno", i.area_terreno_m2 ? `${i.area_terreno_m2} m²` : null],
    ["Financiamento", i.aceita_financiamento === true ? "Aceita" : i.aceita_financiamento === false ? "Não aceita" : null],
    ["FGTS", i.aceita_fgts === true ? "Aceita" : i.aceita_fgts === false ? "Não aceita" : null],
    ["Pagamento", ex.formas_pagamento],
    ["Débitos", i.debitos_regra],
    ["Edital", ex.edital_num],
    ["Leiloeiro", i.leiloeiro],
  ] as [string, React.ReactNode][]).filter(([, v]) => v !== null && v !== undefined && v !== "");

  return (
    <>
      <div className="lote-barra">
        <Link href="/app/buscar" className="volta">← Voltar à busca</Link>
        <div className="lote-acoes">
          <button className={`btn sec ${fav ? "favon" : ""}`} onClick={() => toggle(i.id)} aria-pressed={fav}><IEstrela cheia={fav} />{fav ? "Guardado" : "Guardar"}</button>
          {endCompleto && <a className="btn sec" href={mapsUrl(endCompleto)} target="_blank" rel="noreferrer"><IMapa />Ver no mapa</a>}
          {i.matricula_url && <a className="btn sec" href={i.matricula_url} target="_blank" rel="noreferrer"><IDoc />Matrícula</a>}
          {i.edital_url && <a className="btn sec" href={i.edital_url} target="_blank" rel="noreferrer"><IDoc />Edital</a>}
          <a className="btn" href={i.url} target="_blank" rel="noreferrer">Abrir na fonte ↗</a>
        </div>
      </div>

      <div className="lote-grid">
        <div>
          {/* Galeria */}
          {fotos.length === 0 ? <div className="galeria-vazia">{i.tipo} · a fonte não publicou fotos</div> : (
            <div className={`galeria2 ${fotos.length === 1 ? "uma" : ""}`}>
              <button className="g-principal" onClick={() => setZoom(true)} aria-label="Ampliar foto"><img src={fotos[foto]} alt={i.titulo} referrerPolicy="no-referrer" />{fotos.length > 1 && <span className="g-conta">{foto + 1} / {fotos.length}</span>}</button>
              {fotos.length > 1 && (
                <div className="g-lado">
                  {fotos.slice(0, 4).map((f, k) => <button key={f + k} className={`g-thumb ${k === foto ? "on" : ""}`} onClick={() => setFoto(k)} aria-label={`Foto ${k + 1}`}><img src={f} alt="" referrerPolicy="no-referrer" />{k === 3 && fotos.length > 4 && <span className="g-mais" onClick={(e) => { e.stopPropagation(); setFoto(3); setZoom(true); }}>+{fotos.length - 4}</span>}</button>)}
                </div>)}
            </div>)}
          {zoom && fotos[foto] && (
            <div className="lightbox" onClick={() => setZoom(false)}
              onTouchStart={(e) => setTx(e.touches[0].clientX)}
              onTouchEnd={(e) => { if (tx !== null) { const d = e.changedTouches[0].clientX - tx; if (Math.abs(d) > 50) irFoto(d < 0 ? 1 : -1); } setTx(null); }}>
              <button className="lb-nav esq" onClick={(e) => { e.stopPropagation(); irFoto(-1); }} aria-label="Foto anterior">‹</button>
              <img src={fotos[foto]} alt="" referrerPolicy="no-referrer" onClick={(e) => e.stopPropagation()} />
              <button className="lb-nav dir" onClick={(e) => { e.stopPropagation(); irFoto(1); }} aria-label="Próxima foto">›</button>
              <span className="lb-conta">{foto + 1} de {fotos.length} · arraste ou use as setas</span>
              <button className="lb-fechar" onClick={() => setZoom(false)} aria-label="Fechar">✕</button>
            </div>)}

          <header className="lote-tit">
            <p className="lote-eyebrow">{FONTE_LABEL[i.fonte] ?? i.fonte}<span>·</span>{MODALIDADE_LABEL[i.modalidade]}{i.praca ? <><span>·</span>{i.praca}ª praça</> : null}</p>
            <h1 title={i.titulo}>{i.titulo}</h1>
            <p className="lote-end"><IMapa />{[i.endereco, i.bairro, `${i.cidade}/${i.uf}`].filter(Boolean).join(" · ")}</p>
          </header>

          {/* Especificações */}
          <div className="specs">
            {([
              { ic: <ICasa />, r: "Tipo", v: i.tipo ? i.tipo[0].toUpperCase() + i.tipo.slice(1) : null },
              { ic: <IArea />, r: i.area_privativa_m2 ? "Área útil" : "Terreno", v: i.area_privativa_m2 ? `${i.area_privativa_m2.toLocaleString("pt-BR")} m²` : i.area_terreno_m2 ? `${i.area_terreno_m2.toLocaleString("pt-BR")} m²` : null },
              { ic: <ICama />, r: "Dormitórios", v: i.quartos ?? null },
              { ic: <ICarro />, r: "Vagas", v: i.vagas ?? null },
              { ic: <IChave />, r: "Ocupação", v: i.ocupado === true ? "Ocupado" : i.ocupado === false ? "Desocupado" : null },
              { ic: <IRelogio />, r: i.praca ? `${i.praca}ª praça` : "Leilão", v: u ? u.txt[0].toUpperCase() + u.txt.slice(1) : null },
            ]).map((x) => (
              <div className={`spec ${x.v === null ? "vazio" : ""}`} key={x.r}>
                <span className="spec-ic">{x.ic}</span>
                <b>{x.v ?? "—"}</b>
                <span className="spec-r">{x.r}</span>
              </div>))}
          </div>

          <nav className="ancoras" aria-label="Seções"><a href="#valores">Valores</a><a href="#riscos">Riscos</a><a href="#diligencia">Diligência</a><a href="#documentos">Documentos</a><a href="#descricao">Descrição</a></nav>

          {/* Parte 1 · Valores */}
          <section className="secao" id="valores">
            <h2><span className="parte">Parte 1</span>Valores</h2>
            <p className="lede">Refizemos a conta com todos os custos. O número que importa é o teto: até quanto dá para dar lance mantendo a sua margem.</p>

            <div className="teto">
              <div className="teto-alvo">
                <span>Lance máximo para {alvoPct} de margem</span>
                <b className="num">{brl(lanceAlvo)}</b>
                <small>{lance <= lanceAlvo ? `Seu lance atual está ${brl(lanceAlvo - lance)} abaixo do teto.` : `Atenção: seu lance passa ${brl(lance - lanceAlvo)} do teto.`}</small>
              </div>
              <div className="teto-outros">
                {([[0.25, res.lanceMax25], [0.30, res.lanceMax30], [0.35, res.lanceMax35]] as const).filter(([m]) => Math.abs(m - regras.margemAlvo) > 0.001).map(([m, v]) => (
                  <div key={m}><span>Teto para {pct(m)}</span><b className="num" title={brl(v)}>{brlCurto(v)}</b></div>))}
              </div>
            </div>

            <div className="simular">
              <div className="campo"><span>Se eu vender por</span><CampoMoeda valor={venda} onChange={setVenda} /></div>
              <div className="campo"><span>e arrematar por</span><CampoMoeda valor={lance} onChange={setLance} /></div>
              <button className="btn sec" onClick={() => { setLance(Math.floor(lanceAlvo)); }}>Usar o teto</button>
            </div>

            <div className="conta">
              <div className="conta-linha"><span>Lance</span><b className="num">{brl(lance)}</b></div>
              <div className="conta-linha"><span>Leiloeiro, ITBI e registro <small>{custos.leiloeiro + custos.itbi + custos.registro}% sobre o lance</small></span><b className="num">+ {brl(res.custosSobreLance)}</b></div>
              <div className="conta-linha"><span>Advogado, certidões, débitos e carrego <small>{custos.meses} meses</small></span><b className="num">+ {brl(res.fixos)}</b></div>
              <div className="conta-linha total"><span>Capital total empregado</span><b className="num">{brl(res.total)}</b></div>
              <div className="conta-linha"><span>Venda líquida <small>após {custos.corretagem}% de corretagem</small></span><b className="num">{brl(res.receita)}</b></div>
              <div className="conta-linha"><span>Imposto sobre o ganho <small>{custos.ir}%</small></span><b className="num">- {brl(Math.max(0, res.receita - res.total) * (custos.ir / 100))}</b></div>
              <div className={`conta-resultado ${classe}`}>
                <div><span>Lucro líquido</span><b className="num">{brl(res.lucro)}</b></div>
                <div><span>Margem sobre o capital</span><b className="num">{pct(res.margem)}</b></div>
                <div><span>Deságio real</span><b className="num">{pct(Math.max(0, res.descReal))}</b></div>
              </div>
            </div>

            <details className="custos-det" open={abrirCustos} onToggle={(e) => setAbrirCustos((e.target as HTMLDetailsElement).open)}>
              <summary>Ajustar os custos deste lote</summary>
              <div className="custos">{CAMPOS.map(([k, l]) => l.endsWith("R$")
                ? <div className="campo" key={k}><span>{l.replace(" R$", "")}</span><CampoMoeda valor={custos[k]} onChange={(v) => setCustos({ ...custos, [k]: v })} /></div>
                : <label className="campo" key={k}><span>{l}</span><input className="num" type="number" step="0.1" value={custos[k]} onChange={(e) => setCustos({ ...custos, [k]: +e.target.value || 0 })} /></label>)}</div>
              <p style={{ margin: "12px 0 0" }}><button className="btn sec mini" onClick={() => { setCustos(custosPara(i, regras.custos ?? CUSTOS_PADRAO)); setLance(i.lance_minimo); setVenda(i.avaliacao); }}>Restaurar</button></p>
            </details>
          </section>

          {/* Parte 2 · Riscos */}
          <section className="secao" id="riscos">
            <h2><span className="parte">Parte 2</span>Riscos</h2>
            <p className="lede">O que a fonte e as suas regras já apontam. A leitura da matrícula fecha o resto.</p>
            {av.sinais.length === 0 && <div className="sinal">Nenhum sinal automático neste lote. A diligência manual continua obrigatória.</div>}
            {av.sinais.map((s, k) => <div key={k} className={`sinal ${s.nivel}`}>{s.texto}</div>)}

            <div className={`upload ${arrasto ? "ativo" : ""}`} onDragOver={(e) => { e.preventDefault(); setArrasto(true); }} onDragLeave={() => setArrasto(false)} onDrop={(e) => { e.preventDefault(); setArrasto(false); const f = e.dataTransfer.files?.[0]; if (f) analisar(f); }}>
              <p><b>Análise da matrícula por IA.</b> Arraste o PDF aqui ou <label className="link-arquivo">escolha o arquivo<input type="file" accept="application/pdf" hidden disabled={carregando} onChange={(e) => e.target.files?.[0] && analisar(e.target.files[0])} /></label>.</p>
              <small>{carregando ? "Lendo averbação por averbação…" : "Devolve ônus, penhoras, alertas, custos previstos e o que perguntar antes do lance."}</small>
              {i.matricula_url && !carregando && <div style={{ marginTop: 10 }}><a className="btn sec mini" href={i.matricula_url} target="_blank" rel="noreferrer">Baixar a matrícula da fonte</a></div>}
            </div>
            {erro && <div className="sinal veto" style={{ marginTop: 10 }}>{erro}</div>}
            {ia && (
              <div className="analise">
                <div className={`sinal ${ia.risco_geral === "veto" || ia.risco_geral === "alto" ? "veto" : ia.risco_geral === "medio" ? "alerta" : "info"}`} style={{ marginTop: 14 }}><b>Risco {ia.risco_geral}.</b> {ia.resumo}{ia.proprietario ? ` Proprietário atual: ${ia.proprietario}.` : ""}</div>
                {ia.onus.length > 0 && <><h4>Ônus e gravames</h4><ul>{ia.onus.map((x, k) => <li key={k}>{x}</li>)}</ul></>}
                {ia.alertas.length > 0 && <><h4>Alertas</h4><ul>{ia.alertas.map((x, k) => <li key={k}>{x}</li>)}</ul></>}
                {ia.custos_previstos && ia.custos_previstos.length > 0 && <><h4>Custos previstos</h4><ul>{ia.custos_previstos.map((x, k) => <li key={k}>{x}</li>)}</ul></>}
                {ia.ok.length > 0 && <><h4>Pontos positivos</h4><ul>{ia.ok.map((x, k) => <li key={k}>{x}</li>)}</ul></>}
                {ia.perguntas.length > 0 && <><h4>Perguntar antes do lance</h4><ul>{ia.perguntas.map((x, k) => <li key={k}>{x}</li>)}</ul></>}
              </div>)}
          </section>

          {/* Diligência */}
          <section className="secao" id="diligencia">
            <h2>Diligência <span className="badge">{feitos} de {CHECKLIST.length}</span></h2>
            <p className="lede">Diligência é a checagem feita <b>antes</b> de dar lance. Cada item abaixo é um jeito conhecido de perder dinheiro em leilão. Marque conforme confirmar; fica salvo neste navegador. Não muda o score, muda o seu risco.</p>
            <div className="progresso"><i style={{ width: (feitos / CHECKLIST.length) * 100 + "%" }} /></div>
            <ul className="check">{CHECKLIST.map(([t, d], k) => (
              <li key={t}>
                <input type="checkbox" id={`c${k}`} checked={checks[k]} onChange={(e) => setChecks(checks.map((c, j) => (j === k ? e.target.checked : c)))} />
                <label htmlFor={`c${k}`}><b className={checks[k] ? "ok" : ""}>{t}</b><small>{d}</small></label>
              </li>))}</ul>
          </section>

          {/* Documentos */}
          <section className="secao" id="documentos">
            <h2>Documentos e links</h2>
            <p className="lede">Tudo que a fonte publicou sobre este lote.</p>
            <div className="docs">
              {i.matricula_url && <a href={i.matricula_url} target="_blank" rel="noreferrer"><IDoc />Matrícula do imóvel (PDF)<small>{i.matricula ? `nº ${i.matricula}` : ""}</small></a>}
              {i.edital_url && <a href={i.edital_url} target="_blank" rel="noreferrer"><IDoc />Edital do leilão (PDF)<small>{ex.edital_num ?? ""}</small></a>}
              <a href={i.url} target="_blank" rel="noreferrer"><IDoc />Página do lote em {FONTE_LABEL[i.fonte] ?? i.fonte}<small>abre em nova aba</small></a>
              {endCompleto && <a href={mapsUrl(endCompleto)} target="_blank" rel="noreferrer"><IMapa />Ver o endereço no Google Maps<small>{i.cidade}/{i.uf}</small></a>}
              {i.tambem_em?.map((t) => <a key={t.url} href={t.url} target="_blank" rel="noreferrer"><IDoc />Mesmo lote em {FONTE_LABEL[t.fonte] ?? t.fonte}<small>{brl(t.lance_minimo)}</small></a>)}
              {!i.matricula_url && !i.edital_url && <div className="sinal alerta">A fonte não publicou matrícula nem edital. Peça os dois ao leiloeiro antes de qualquer lance.</div>}
            </div>
          </section>

          {(i.descricao || ex.descricao_detalhe) && <section className="secao" id="descricao"><h2>Descrição da fonte</h2><pre className="desc">{[ex.descricao_detalhe, i.descricao].filter(Boolean).join("\n\n")}</pre></section>}
        </div>

        {/* Lateral */}
        <aside className="lateral">
          <div className={`veredicto ${classe}`}>
            <div className="v-cab">
              <span className="v-pill">{veto ? "VETO" : classe === "go" ? "GO" : classe === "atencao" ? "ATENÇÃO" : "NO-GO"}</span>
              <span className="v-score">Score <b className="num">{av.score}</b><small>/100</small></span>
            </div>
            <div className="v-barra" aria-hidden><i style={{ width: `${av.score}%` }} /></div>
            {veto ? <p className="v-nota">Este lote é vetado pelas suas regras. Não avance.</p> : (<>
              <div className="v-heroi">
                <span>Margem líquida</span>
                <b className="num">{pct(res.margem)}</b>
              </div>
              <p className="v-nota"><b className="num">{brl(res.lucro)}</b> de lucro sobre <b className="num">{brl(res.total)}</b> de capital empregado.</p>
            </>)}
            <div className="v-metricas">
              <div><span>Lance mínimo</span><b className="num">{brlCurto(i.lance_minimo)}</b></div>
              <div><span>Avaliação</span><b className="num">{brlCurto(i.avaliacao)}</b></div>
              <div><span>Deságio</span><b className="num">{pct(i.desagio_pct)}</b></div>
            </div>
          </div>

          <div className="cart">
            <div className="cart-cab"><span>Seu teto de lance</span></div>
            <div className="cart-corpo">
              <div className="teto-h">
                <span>Para {alvoPct} de margem</span>
                <b className="num">{brl(lanceAlvo)}</b>
              </div>
              <Regua grande minimo={i.lance_minimo} avaliacao={i.avaliacao} lance={lance} max25={res.lanceMax25} max30={res.lanceMax30} max35={res.lanceMax35} />
              <div className="teto-alt">
                {([[0.25, res.lanceMax25], [0.30, res.lanceMax30], [0.35, res.lanceMax35]] as const).filter(([m]) => Math.abs(m - regras.margemAlvo) > 0.001).map(([m, v]) => (
                  <div key={m}><span>{pct(m)} de margem</span><b className="num" title={brl(v)}>{brlCurto(v)}</b></div>))}
              </div>
            </div>
            {(() => {
              const p1 = ex.lance_1a_praca ?? (i.praca === 1 ? i.lance_minimo : undefined);
              const p2 = ex.lance_2a_praca ?? (i.praca === 2 || !i.praca ? i.lance_minimo : undefined);
              const d1 = ex.datas_leilao?.["1"] ?? (i.praca === 1 ? i.data_leilao : undefined);
              const d2 = ex.datas_leilao?.["2"] ?? (i.praca !== 1 ? (i.data_leilao ?? i.data_fim) : undefined);
              const cols = [p1 !== undefined && { t: "1ª praça", v: p1, d: d1, on: i.praca === 1 }, p2 !== undefined && { t: i.praca ? "2ª praça" : "Lance mínimo", v: p2, d: d2, on: i.praca !== 1 }].filter(Boolean) as { t: string; v: number; d?: string; on: boolean }[];
              if (!cols.length) return null;
              return <div className="cart-bloco">{cols.map((c) => (
                <div className={`praca-lin ${c.on ? "on" : ""}`} key={c.t}>
                  <span className="p-t">{c.t}{c.on && <i>vigente</i>}</span>
                  <span className="p-v"><b className="num" title={brl(c.v)}>{brlCurto(c.v)}</b><small>{dataBR(c.d, { day: "2-digit", month: "short", year: "numeric" }) ?? "sem data"}</small></span>
                </div>))}</div>;
            })()}
            {linhas.length > 0 && <dl className="linhas">{linhas.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>}
            <div className="cart-pe mono">{i.id} · coletado {dataBR(i.coletado_em, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
          </div>

          <div className="cta-lote">
            <b>Quer arrematar com a conta pronta?</b>
            <p>Lemos matrícula e edital, fechamos o lance máximo e acompanhamos o pregão. 3% só se você arrematar.</p>
            <a className="btn ouro" href={contato(`Olá, quero assessoria da ${MARCA} para o lote ${i.titulo} (${i.cidade}/${i.uf}).`)} target="_blank" rel="noreferrer">Pedir assessoria neste lote</a>
          </div>
        </aside>
      </div>

      <Link href={`/app/sage?lote=${encodeURIComponent(i.id)}`} className="sage-flutuante" aria-label="Perguntar ao Sage sobre este lote">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12a8 8 0 1 1 4.2 7L4 20l1-4.2A8 8 0 0 1 4 12z" /><path d="M9 11h6M9 14h4" /></svg>
        <span>Perguntar ao Sage</span>
      </Link>
    </>
  );
}
