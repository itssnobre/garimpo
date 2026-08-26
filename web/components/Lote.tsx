"use client";
import { useEffect, useMemo, useState } from "react";
import type { Imovel } from "@/lib/types";
import { avaliar, brl, pct, calcular, custosPara, CUSTOS_PADRAO, FONTE_LABEL, MODALIDADE_LABEL, type Custos } from "@/lib/motor";
import Regua from "./Regua";
import { urgencia, mapsUrl } from "@/lib/util";
import { useFavoritos } from "@/lib/favoritos";
import { IArea, ICama, ICarro, ICasa, IChave, IDoc, IEstrela, IMapa, IRelogio } from "./Icones";

const CHECKLIST = [
  "Edital lido inteiro: regra de débitos (condomínio e IPTU) e quem paga",
  "Matrícula atualizada (até 30 dias): ônus, penhoras, execução condominial, cláusulas de retrocessão",
  "Consolidação da propriedade com intimação pessoal (por edital = risco de anulatória)",
  "Não é direitos de fiduciante nem fração ideal",
  "Débitos de condomínio confirmados com o síndico (valor real)",
  "IPTU e débitos municipais consultados na prefeitura",
  "Valor de venda conferido com 3 comparáveis no entorno de 500 m a 1 km",
  "Ocupação verificada (visita externa, vizinhos, porteiro)",
  "Custo de desocupação e reforma estimado",
  "Lance máximo definido antes do leilão e respeitado",
];
interface AnaliseIA { resumo: string; risco_geral: "baixo" | "medio" | "alto" | "veto"; proprietario?: string; onus: string[]; alertas: string[]; ok: string[]; perguntas: string[]; custos_previstos?: string[] }
const CAMPOS: [keyof Custos, string][] = [["leiloeiro", "Leiloeiro %"], ["itbi", "ITBI %"], ["registro", "Registro %"], ["advogado", "Advogado R$"], ["certidoes", "Certidões R$"], ["debitos", "Débitos R$"], ["desocupacao", "Desocupação R$"], ["reforma", "Reforma R$"], ["meses", "Meses até vender"], ["mensal", "Custo mensal R$"], ["corretagem", "Corretagem %"], ["ir", "IR ganho capital %"], ["descontoVenda", "Vender abaixo da aval. %"]];
const data = (s?: string) => (s ? new Date(s + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }) : null);
const simnao = (v?: boolean | null) => (v === true ? "Sim" : v === false ? "Não" : null);

export default function Lote({ imovel: i }: { imovel: Imovel }) {
  const ex = i as Imovel & { lance_1a_praca?: number; lance_2a_praca?: number; datas_leilao?: Record<string, string>; formas_pagamento?: string; edital_num?: string; inscricao_imobiliaria?: string; descricao_detalhe?: string };
  const [custos, setCustos] = useState<Custos>(() => custosPara(i, CUSTOS_PADRAO));
  const [lance, setLance] = useState(i.lance_minimo); const [venda, setVenda] = useState(i.avaliacao);
  const [checks, setChecks] = useState<boolean[]>(CHECKLIST.map(() => false));
  const [ia, setIa] = useState<AnaliseIA | null>(null); const [erro, setErro] = useState(""); const [carregando, setCarregando] = useState(false); const [arrasto, setArrasto] = useState(false);
  const [foto, setFoto] = useState(0); const [zoom, setZoom] = useState(false);
  const chave = `garimpo:${i.id}`;
  useEffect(() => { try { const s = localStorage.getItem(chave); if (s) { const d = JSON.parse(s); d.custos && setCustos(d.custos); d.lance && setLance(d.lance); d.venda && setVenda(d.venda); d.checks && setChecks(d.checks); d.ia && setIa(d.ia); } } catch {} }, [chave]);
  useEffect(() => { try { localStorage.setItem(chave, JSON.stringify({ custos, lance, venda, checks, ia })); } catch {} }, [chave, custos, lance, venda, checks, ia]);

  const res = useMemo(() => calcular(venda, lance, custos), [venda, lance, custos]);
  const av = useMemo(() => avaliar(i), [i]);
  const veto = av.sinais.some((s) => s.nivel === "veto") || ia?.risco_geral === "veto";
  const classe = veto ? "nogo" : res.lucro <= 0 || res.margem < 0.25 ? "nogo" : res.margem < 0.30 ? "atencao" : "go";
  const feitos = checks.filter(Boolean).length;
  const fotos = i.fotos ?? [];
  const u = urgencia(i.data_leilao);
  const { favs, toggle } = useFavoritos(); const fav = favs.has(i.id);
  const endCompleto = [i.endereco, i.bairro, i.cidade, i.uf].filter(Boolean).join(", ");

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

  const linhas: [string, React.ReactNode, boolean?][] = [
    ["Matrícula", i.matricula ? <span className="mono">{i.matricula}</span> : null],
    ["Cartório", i.cartorio],
    ["Inscrição", ex.inscricao_imobiliaria ? <span className="mono">{ex.inscricao_imobiliaria}</span> : null],
    ["Tipo", i.tipo],
    ["Área privativa", i.area_privativa_m2 ? `${i.area_privativa_m2} m²` : null],
    ["Terreno", i.area_terreno_m2 ? `${i.area_terreno_m2} m²` : null],
    ["Dormitórios", i.quartos ?? null], ["Vagas", i.vagas ?? null],
    ["Ocupação", i.ocupado === true ? "Ocupado" : i.ocupado === false ? "Desocupado" : null],
    ["Financiamento", simnao(i.aceita_financiamento)], ["FGTS", simnao(i.aceita_fgts)],
    ["Pagamento", ex.formas_pagamento],
    ["Débitos", i.debitos_regra],
    ["Edital", ex.edital_num],
    ["Leiloeiro", i.leiloeiro],
    ["CEP", i.cep],
  ];

  return (
    <>
      <header className="lote-cab">
        <div>
          <div className="volta" style={{ color: "var(--ouro-tinta)" }}>{FONTE_LABEL[i.fonte] ?? i.fonte} · {MODALIDADE_LABEL[i.modalidade]}{i.praca ? ` · ${i.praca}ª praça` : ""}{av.regiao !== "Outra" ? ` · região ${av.regiao}` : ""}</div>
          <h1>{i.titulo}</h1>
          <div className="end">{[i.endereco, i.bairro, `${i.cidade}/${i.uf}`].filter(Boolean).join(" · ")}</div>
        </div>
        <div className="acoes">
          <button className={`btn sec ${fav ? "" : ""}`} onClick={() => toggle(i.id)} aria-pressed={fav} style={fav ? { color: "var(--ouro-tinta)", borderColor: "var(--ouro)" } : undefined}><IEstrela cheia={fav} /> {fav ? "Favorito" : "Guardar"}</button>
          <a className="btn" href={i.url} target="_blank" rel="noreferrer">Abrir na fonte ↗</a>
          {i.edital_url && <a className="btn sec" href={i.edital_url} target="_blank" rel="noreferrer">Edital PDF</a>}
          {i.matricula_url && <a className="btn ouro" href={i.matricula_url} target="_blank" rel="noreferrer">Matrícula PDF</a>}
        </div>
      </header>

      <div className="lote-grid">
        <div>
          <div className={`galeria ${fotos.length <= 1 ? "uma" : ""}`}>
            {fotos.length === 0 ? <div className="semfoto">{i.tipo} · a fonte não publicou foto</div> : (
              <>
                <div className="principal"><img src={fotos[foto]} alt={i.titulo} referrerPolicy="no-referrer" onClick={() => setZoom(true)} /></div>
                {fotos.length > 1 && <div className="thumbs">{fotos.slice(0, 8).map((f, k) => <img key={f} src={f} alt="" referrerPolicy="no-referrer" onClick={() => setFoto(k)} style={{ outline: k === foto ? "2px solid var(--ouro)" : "none" }} />)}</div>}
              </>)}
          </div>
          {zoom && fotos[foto] && <div className="lightbox" onClick={() => setZoom(false)}><img src={fotos[foto]} alt="" referrerPolicy="no-referrer" /></div>}

          <div className="fatos-grid">
            <div><ICasa /><div><span>Tipo</span><b>{i.tipo}</b></div></div>
            <div><IArea /><div><span>{i.area_privativa_m2 ? "Área privativa" : "Terreno"}</span><b>{i.area_privativa_m2 ? `${i.area_privativa_m2} m²` : i.area_terreno_m2 ? `${i.area_terreno_m2} m²` : "não informado"}</b></div></div>
            <div><ICama /><div><span>Dormitórios</span><b>{i.quartos ?? "não inf."}</b></div></div>
            <div><ICarro /><div><span>Vagas</span><b>{i.vagas ?? "não inf."}</b></div></div>
            <div><IChave /><div><span>Ocupação</span><b>{i.ocupado === true ? "Ocupado" : i.ocupado === false ? "Desocupado" : "não inf."}</b></div></div>
            <div><IRelogio /><div><span>Leilão</span><b>{u ? u.txt : "sem data"}</b></div></div>
          </div>
          <nav className="ancoras" aria-label="Seções"><a href="#riscos">Riscos</a><a href="#valores">Valores</a><a href="#diligencia">Diligência</a><a href="#documentos">Documentos</a><a href="#descricao">Descrição</a></nav>

          <section className="secao" id="riscos">
            <h2><span className="parte">Parte 1</span>Riscos</h2>
            <p className="lede">O que a fonte e as regras do garimpo já apontam. A leitura da matrícula fecha o resto.</p>
            {av.sinais.length === 0 && <div className="sinal">Nenhum sinal automático. Diligência manual obrigatória.</div>}
            {av.sinais.map((s, k) => <div key={k} className={`sinal ${s.nivel}`}>{s.texto}</div>)}
            <div className={`upload ${arrasto ? "ativo" : ""}`} onDragOver={(e) => { e.preventDefault(); setArrasto(true); }} onDragLeave={() => setArrasto(false)} onDrop={(e) => { e.preventDefault(); setArrasto(false); const f = e.dataTransfer.files?.[0]; if (f) analisar(f); }}>
              <p><b>Analisar matrícula com IA.</b> Arraste o PDF da matrícula atualizada (ou do edital) ou <label style={{ textDecoration: "underline", cursor: "pointer" }}>escolha o arquivo<input type="file" accept="application/pdf" hidden disabled={carregando} onChange={(e) => e.target.files?.[0] && analisar(e.target.files[0])} /></label>.</p>
              <small>{carregando ? "Lendo averbação por averbação…" : "A IA lê o histórico inteiro e devolve ônus, alertas, custos previstos e o que perguntar antes do lance."}</small>
              {i.matricula_url && !carregando && <div style={{ marginTop: 8 }}><a className="btn sec" href={i.matricula_url} target="_blank" rel="noreferrer">Baixar a matrícula da fonte</a></div>}
            </div>
            {erro && <div className="sinal veto" style={{ marginTop: 10 }}>{erro}</div>}
            {ia && (
              <div className="analise">
                <div className={`sinal ${ia.risco_geral === "veto" || ia.risco_geral === "alto" ? "veto" : ia.risco_geral === "medio" ? "alerta" : "info"}`} style={{ marginTop: 12 }}><b>Risco {ia.risco_geral}.</b> {ia.resumo}{ia.proprietario ? ` Proprietário atual: ${ia.proprietario}.` : ""}</div>
                {ia.onus.length > 0 && <><h4>Ônus e gravames</h4><ul>{ia.onus.map((x, k) => <li key={k}>{x}</li>)}</ul></>}
                {ia.alertas.length > 0 && <><h4>Alertas</h4><ul>{ia.alertas.map((x, k) => <li key={k}>{x}</li>)}</ul></>}
                {ia.custos_previstos && ia.custos_previstos.length > 0 && <><h4>Custos previstos</h4><ul>{ia.custos_previstos.map((x, k) => <li key={k}>{x}</li>)}</ul></>}
                {ia.ok.length > 0 && <><h4>Pontos positivos</h4><ul>{ia.ok.map((x, k) => <li key={k}>{x}</li>)}</ul></>}
                {ia.perguntas.length > 0 && <><h4>Perguntar antes do lance</h4><ul>{ia.perguntas.map((x, k) => <li key={k}>{x}</li>)}</ul></>}
              </div>)}
          </section>

          <section className="secao" id="valores">
            <h2><span className="parte">Parte 2</span>Valores</h2>
            <p className="lede">Capital total, lucro líquido e o lance máximo que ainda respeita a margem.</p>
            <div className="doisdois">
              <div>
                <div className="par">
                  <label className="campo"><span>Valor real de venda R$</span><input className="mono" type="number" value={venda} onChange={(e) => setVenda(+e.target.value || 0)} /></label>
                  <label className="campo"><span>Seu lance R$</span><input className="mono" type="number" value={lance} onChange={(e) => setLance(+e.target.value || 0)} /></label>
                </div>
                <div className="tres">
                  <div><span>25% mínimo</span><b>{brl(res.lanceMax25)}</b></div>
                  <div className="alvo"><span>30% alvo</span><b>{brl(res.lanceMax30)}</b></div>
                  <div><span>35%</span><b>{brl(res.lanceMax35)}</b></div>
                </div>
                <dl className="kv">
                  <dt>Lance</dt><dd>{brl(lance)}</dd>
                  <dt>Leiloeiro + ITBI + registro</dt><dd>{brl(res.custosSobreLance)}</dd>
                  <dt>Fixos + carrego ({custos.meses} m)</dt><dd>{brl(res.fixos)}</dd>
                  <div className="total" style={{ display: "contents" }}><dt>Capital total</dt><dd>{brl(res.total)}</dd></div>
                  <dt>Venda líquida (após corretagem)</dt><dd>{brl(res.receita)}</dd>
                  <dt>Lucro líquido (após IR)</dt><dd style={{ color: res.lucro > 0 ? "var(--go)" : "var(--stop)" }}>{brl(res.lucro)}</dd>
                  <dt>Margem sobre capital</dt><dd>{pct(res.margem)}</dd>
                  <dt>Deságio real</dt><dd>{pct(Math.max(0, res.descReal))}</dd>
                </dl>
              </div>
              <div>
                <h4 style={{ margin: "0 0 8px", fontFamily: "var(--f-display)", fontSize: 13, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--musgo)" }}>Custos (edite pro caso real)</h4>
                <div className="custos">{CAMPOS.map(([k, label]) => <label className="campo" key={k}><span>{label}</span><input className="mono" type="number" value={custos[k]} onChange={(e) => setCustos({ ...custos, [k]: +e.target.value || 0 })} /></label>)}</div>
                <p style={{ margin: "10px 0 0" }}><button className="btn sec" onClick={() => { setCustos(custosPara(i, CUSTOS_PADRAO)); setLance(i.lance_minimo); setVenda(i.avaliacao); }}>Restaurar padrão</button></p>
              </div>
            </div>
          </section>

          <section className="secao" id="diligencia">
            <h2>Diligência <span className="mono" style={{ fontSize: 13, color: "var(--musgo)", fontWeight: 500 }}>{feitos}/{CHECKLIST.length}</span></h2>
            <div className="progresso"><i style={{ width: (feitos / CHECKLIST.length) * 100 + "%" }} /></div>
            <ul className="check">{CHECKLIST.map((t, k) => <li key={k}><input type="checkbox" id={`c${k}`} checked={checks[k]} onChange={(e) => setChecks(checks.map((c, j) => (j === k ? e.target.checked : c)))} /><label htmlFor={`c${k}`} className={checks[k] ? "ok" : ""}>{t}</label></li>)}</ul>
          </section>

          <section className="secao" id="documentos">
            <h2>Documentos e links</h2>
            <p className="lede">Tudo que a fonte publicou sobre este lote, mais o mapa do endereço.</p>
            <div className="docs">
              {i.matricula_url && <a href={i.matricula_url} target="_blank" rel="noreferrer"><IDoc />Matrícula do imóvel (PDF)<small>{i.matricula ? `nº ${i.matricula}` : ""}</small></a>}
              {i.edital_url && <a href={i.edital_url} target="_blank" rel="noreferrer"><IDoc />Edital do leilão (PDF)<small>{ex.edital_num ?? ""}</small></a>}
              <a href={i.url} target="_blank" rel="noreferrer"><IDoc />Página do lote em {FONTE_LABEL[i.fonte] ?? i.fonte}<small>abre em nova aba</small></a>
              {endCompleto && <a href={mapsUrl(endCompleto)} target="_blank" rel="noreferrer"><IMapa />Ver no Google Maps<small>{i.cidade}</small></a>}
              {i.tambem_em?.map((t) => <a key={t.url} href={t.url} target="_blank" rel="noreferrer"><IDoc />Mesmo lote em {FONTE_LABEL[t.fonte] ?? t.fonte}<small>{brl(t.lance_minimo)}</small></a>)}
              {!i.matricula_url && !i.edital_url && <div className="sinal">A fonte não publicou matrícula nem edital. Peça ao leiloeiro antes de qualquer lance.</div>}
            </div>
          </section>

          {(i.descricao || ex.descricao_detalhe) && <section className="secao" id="descricao"><h2>Descrição da fonte</h2><pre className="desc">{[ex.descricao_detalhe, i.descricao].filter(Boolean).join("\n\n")}</pre></section>}
        </div>

        <aside className="lateral">
          {u && <div className={`contador ${u.nivel}`}><IRelogio /><span>{i.praca ? `${i.praca}ª praça` : "Leilão"}: <b>{u.txt}</b>{i.data_leilao ? ` · ${data(i.data_leilao)}` : ""}</span></div>}
          <div className={`veredito ${classe}`}>
            <div className="big">{veto ? "VETO" : classe === "go" ? "GO" : classe === "atencao" ? "ATENÇÃO" : "NO-GO"}</div>
            <div className="sc">score {av.score} · {av.motivos.slice(0, 2).join(" · ")}</div>
            <p>{veto ? "Veto de diligência. Não avançar." : `Margem líquida ${pct(res.margem)} sobre ${brl(res.total)} de capital. Lucro ${brl(res.lucro)}.`}</p>
          </div>
          <div className="ficha-cart">
            <div className="cab"><span>Ficha do lote</span><span className="mono">{i.id}</span></div>
            <div style={{ padding: "12px 16px 0" }}>
              <Regua grande minimo={i.lance_minimo} avaliacao={i.avaliacao} lance={lance} max25={res.lanceMax25} max30={res.lanceMax30} max35={res.lanceMax35} />
              <div className="legenda-regua"><span><i style={{ background: "var(--go)" }} />margem ≥ 35%</span><span><i style={{ background: "var(--warn)" }} />25 a 35%</span><span><i style={{ background: "var(--veio)" }} />abaixo de 25%</span><span><i style={{ background: "var(--tinta)" }} />seu lance</span></div>
            </div>
            <div className="pracas" style={{ paddingTop: 14 }}>
              <div className={i.praca === 1 ? "ativa" : ""}><span>1ª praça</span><b>{ex.lance_1a_praca ? brl(ex.lance_1a_praca) : i.praca === 1 ? brl(i.lance_minimo) : "—"}</b><small>{data(ex.datas_leilao?.["1"]) ?? (i.praca === 1 ? data(i.data_leilao) : "") ?? ""}</small></div>
              <div className={i.praca === 2 || !i.praca ? "ativa" : ""}><span>{i.praca ? "2ª praça" : "Lance mínimo"}</span><b>{ex.lance_2a_praca ? brl(ex.lance_2a_praca) : brl(i.lance_minimo)}</b><small>{data(ex.datas_leilao?.["2"]) ?? data(i.data_leilao) ?? data(i.data_fim) ?? "sem data na fonte"}</small></div>
            </div>
            <dl className="linhas">
              <div><dt>Avaliação</dt><dd className="mono">{brl(i.avaliacao)} <span style={{ color: "var(--musgo)" }}>· deságio {pct(i.desagio_pct)}</span></dd></div>
              {linhas.map(([k, v]) => <div key={k}><dt>{k}</dt>{v !== null && v !== undefined && v !== "" ? <dd>{v}</dd> : <dd className="fraco">não informado</dd>}</div>)}
              <div><dt>Coletado</dt><dd className="fraco">{new Date(i.coletado_em).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</dd></div>
            </dl>
            {i.tambem_em && i.tambem_em.length > 0 && <div className="tambem" style={{ padding: "0 16px 14px" }}><span style={{ fontSize: 12, color: "var(--musgo)" }}>Mesmo lote em:</span><br />{i.tambem_em.map((t) => <a key={t.url} href={t.url} target="_blank" rel="noreferrer">{FONTE_LABEL[t.fonte] ?? t.fonte} · {brl(t.lance_minimo)}</a>)}</div>}
          </div>
        </aside>
      </div>
    </>
  );
}
