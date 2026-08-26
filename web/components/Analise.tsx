"use client";
import { useEffect, useMemo, useState } from "react";
import type { Imovel } from "@/lib/types";
import { avaliar, brl, pct, calcular, custosPara, CUSTOS_PADRAO, type Custos } from "@/lib/motor";

const CHECKLIST = [
  "Edital lido inteiro: regra de débitos (condomínio/IPTU) e quem paga",
  "Matrícula atualizada (até 30 dias): ônus, penhoras, execução condominial, cláusulas de retrocessão",
  "Consolidação da propriedade com intimação PESSOAL (edital = risco de anulatória)",
  "Não é direitos de fiduciante nem fração ideal",
  "Débitos de condomínio levantados com o síndico (valor real, não estimado)",
  "IPTU e débitos municipais consultados na prefeitura",
  "Valor de venda conferido com 3 comparáveis no entorno de 500m a 1km",
  "Ocupação verificada (visita externa, vizinhos, porteiro)",
  "Custo de desocupação e reforma estimado",
  "Lance máximo definido ANTES do leilão e respeitado",
];

interface AnaliseIA { resumo: string; risco_geral: "baixo" | "medio" | "alto" | "veto"; proprietario?: string; onus: string[]; alertas: string[]; ok: string[]; perguntas: string[]; custos_previstos?: string[] }

const CAMPOS: [keyof Custos, string, string][] = [
  ["leiloeiro", "Leiloeiro %", "%"], ["itbi", "ITBI %", "%"], ["registro", "Registro %", "%"], ["advogado", "Advogado R$", "R$"], ["certidoes", "Certidões R$", "R$"],
  ["debitos", "Débitos (cond./IPTU) R$", "R$"], ["desocupacao", "Desocupação R$", "R$"], ["reforma", "Reforma R$", "R$"], ["meses", "Meses até vender", "m"],
  ["mensal", "Custo mensal R$", "R$"], ["corretagem", "Corretagem %", "%"], ["ir", "IR ganho capital %", "%"], ["descontoVenda", "Vender abaixo da aval. %", "%"],
];

export default function Analise({ imovel: i }: { imovel: Imovel }) {
  const [custos, setCustos] = useState<Custos>(() => custosPara(i, CUSTOS_PADRAO));
  const [lance, setLance] = useState(i.lance_minimo);
  const [venda, setVenda] = useState(i.avaliacao);
  const [checks, setChecks] = useState<boolean[]>(CHECKLIST.map(() => false));
  const [ia, setIa] = useState<AnaliseIA | null>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const chave = `garimpo:${i.id}`;

  useEffect(() => { try { const s = localStorage.getItem(chave); if (s) { const d = JSON.parse(s); d.custos && setCustos(d.custos); d.lance && setLance(d.lance); d.venda && setVenda(d.venda); d.checks && setChecks(d.checks); d.ia && setIa(d.ia); } } catch {} }, [chave]);
  useEffect(() => { try { localStorage.setItem(chave, JSON.stringify({ custos, lance, venda, checks, ia })); } catch {} }, [chave, custos, lance, venda, checks, ia]);

  const res = useMemo(() => calcular(venda, lance, custos), [venda, lance, custos]);
  const av = useMemo(() => avaliar(i), [i]);
  const classe = res.lucro <= 0 || res.margem < 0.25 ? "nogo" : res.margem < 0.30 ? "atencao" : "go";
  const veto = av.sinais.some((s) => s.nivel === "veto") || ia?.risco_geral === "veto";

  async function analisar(file: File) {
    setErro(""); setCarregando(true);
    try {
      const fd = new FormData(); fd.append("file", file); fd.append("contexto", JSON.stringify({ titulo: i.titulo, endereco: i.endereco, cidade: i.cidade, modalidade: i.modalidade, matricula: i.matricula, descricao: i.descricao?.slice(0, 3000) }));
      const r = await fetch("/api/matricula", { method: "POST", body: fd });
      if (!r.ok) throw new Error(await r.text());
      setIa(await r.json());
    } catch (e) { setErro(String((e as Error).message || e)); } finally { setCarregando(false); }
  }

  return (
    <div className="grid2">
      <div>
        <div className={`verdict ${veto ? "nogo" : classe}`}>
          <div className="big">{veto ? "VETO" : classe === "go" ? "GO" : classe === "atencao" ? "ATENÇÃO" : "NO-GO"}<span style={{ fontSize: 16, marginLeft: 12, opacity: .85 }}>score {av.score}</span></div>
          <p>{veto ? "Veto de diligência. Não avançar." : `Margem líquida de ${pct(res.margem)} sobre o capital empregado (${brl(res.total)}), lucro estimado ${brl(res.lucro)}, deságio real ${pct(Math.max(0, res.descReal))} depois dos custos.`}</p>
        </div>

        <div className="card" style={{ marginBottom: 14 }}>
          <h2>Parte 1 · Riscos</h2>
          {av.sinais.length === 0 && <p className="sub">Nenhum sinal automático. Diligência manual obrigatória.</p>}
          {av.sinais.map((s, k) => <div key={k} className={`sinal ${s.nivel}`}>{s.texto}</div>)}
          {i.debitos_regra && <div className="sinal info"><b>Regra de débitos da fonte:</b> {i.debitos_regra}</div>}
          <h3 style={{ fontFamily: "Georgia,serif", fontSize: 15, margin: "16px 0 6px" }}>Análise da matrícula por IA</h3>
          <p className="sub">Envie o PDF da matrícula atualizada (ou do edital). A IA lê o histórico inteiro e aponta ônus, execuções, cláusulas e o que perguntar.</p>
          <p><input type="file" accept="application/pdf" disabled={carregando} onChange={(e) => e.target.files?.[0] && analisar(e.target.files[0])} /> {carregando && <span className="sub">analisando…</span>}</p>
          {erro && <div className="sinal veto">{erro}</div>}
          {ia && (
            <div className="analise">
              <div className={`sinal ${ia.risco_geral === "veto" || ia.risco_geral === "alto" ? "veto" : ia.risco_geral === "medio" ? "alerta" : "info"}`}><b>Risco {ia.risco_geral}.</b> {ia.resumo}{ia.proprietario ? ` Proprietário atual: ${ia.proprietario}.` : ""}</div>
              {ia.onus.length > 0 && <><h3>Ônus e gravames na matrícula</h3><ul>{ia.onus.map((x, k) => <li key={k}>{x}</li>)}</ul></>}
              {ia.alertas.length > 0 && <><h3>Alertas</h3><ul>{ia.alertas.map((x, k) => <li key={k}>{x}</li>)}</ul></>}
              {ia.custos_previstos && ia.custos_previstos.length > 0 && <><h3>Custos previstos</h3><ul>{ia.custos_previstos.map((x, k) => <li key={k}>{x}</li>)}</ul></>}
              {ia.ok.length > 0 && <><h3>Pontos positivos</h3><ul>{ia.ok.map((x, k) => <li key={k}>{x}</li>)}</ul></>}
              {ia.perguntas.length > 0 && <><h3>Perguntar antes de dar lance</h3><ul>{ia.perguntas.map((x, k) => <li key={k}>{x}</li>)}</ul></>}
            </div>
          )}
        </div>

        <div className="card" style={{ marginBottom: 14 }}>
          <h2>Checklist de diligência</h2>
          <ul className="check">{CHECKLIST.map((t, k) => <li key={k}><input type="checkbox" checked={checks[k]} onChange={(e) => setChecks(checks.map((c, j) => (j === k ? e.target.checked : c)))} /><span style={{ textDecoration: checks[k] ? "line-through" : "none", opacity: checks[k] ? .6 : 1 }}>{t}</span></li>)}</ul>
        </div>

        {i.fotos && i.fotos.length > 0 && <div className="fotos">{i.fotos.slice(0, 12).map((f) => <img key={f} src={f} alt="" loading="lazy" />)}</div>}
        {i.descricao && <div className="card"><h2>Descrição da fonte</h2><pre className="desc">{i.descricao}</pre></div>}
      </div>

      <div>
        <div className="card" style={{ marginBottom: 14 }}>
          <h2>Parte 2 · Valores</h2>
          <div className="fields">
            <label className="f">Valor real de venda R$<input type="number" value={venda} onChange={(e) => setVenda(+e.target.value || 0)} /></label>
            <label className="f">Lance R$<input type="number" value={lance} onChange={(e) => setLance(+e.target.value || 0)} /></label>
          </div>
          <p className="sub" style={{ margin: "6px 0 0" }}>Avaliação da fonte: {brl(i.avaliacao)} · lance mínimo: {brl(i.lance_minimo)} · deságio {pct(i.desagio_pct)}</p>
          <h3 style={{ fontFamily: "Georgia,serif", fontSize: 15, margin: "14px 0 4px" }}>Lance máximo para respeitar a margem</h3>
          <div className="lancemax">
            <div><span>25% mín.</span><b>{brl(res.lanceMax25)}</b></div>
            <div><span>30% alvo</span><b>{brl(res.lanceMax30)}</b></div>
            <div><span>35%</span><b>{brl(res.lanceMax35)}</b></div>
          </div>
          <dl className="kv">
            <dt>Lance</dt><dd>{brl(lance)}</dd>
            <dt>Leiloeiro + ITBI + registro</dt><dd>{brl(res.custosSobreLance)}</dd>
            <dt>Custos fixos + carrego</dt><dd>{brl(res.fixos)}</dd>
            <dt><b>Capital total</b></dt><dd><b>{brl(res.total)}</b></dd>
            <dt>Venda líquida (após corretagem)</dt><dd>{brl(res.receita)}</dd>
            <dt>Lucro líquido (após IR)</dt><dd>{brl(res.lucro)}</dd>
            <dt>Margem sobre capital</dt><dd>{pct(res.margem)}</dd>
            <dt>Deságio real</dt><dd>{pct(Math.max(0, res.descReal))}</dd>
          </dl>
        </div>
        <div className="card">
          <h2>Custos (edite pro caso real)</h2>
          <div className="fields">
            {CAMPOS.map(([k, label]) => <label className="f" key={k}>{label}<input type="number" value={custos[k]} onChange={(e) => setCustos({ ...custos, [k]: +e.target.value || 0 })} /></label>)}
          </div>
          <p><button className="btn sec" onClick={() => { setCustos(custosPara(i, CUSTOS_PADRAO)); setLance(i.lance_minimo); setVenda(i.avaliacao); }}>Restaurar padrão</button></p>
        </div>
      </div>
    </div>
  );
}
