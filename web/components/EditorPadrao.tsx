"use client";
import { useMemo, useState } from "react";
import { useIndice } from "@/lib/indice";
import { avaliarPadrao, MODALIDADE_LABEL, type Custos } from "@/lib/motor";
import { brl, pct } from "@/lib/fmt";
import { PRESETS, TIPOS, UFS, novoPadrao, type Padrao } from "@/lib/padrao";

const CUSTOS: [keyof Custos, string][] = [["leiloeiro", "Leiloeiro %"], ["itbi", "ITBI % (padrão)"], ["registro", "Registro %"], ["advogado", "Advogado R$"], ["certidoes", "Certidões R$"], ["desocupacao", "Desocupação R$ (0 = automático)"], ["reforma", "Reforma R$"], ["meses", "Meses até vender"], ["mensal", "Custo mensal R$"], ["corretagem", "Corretagem %"], ["ir", "IR ganho capital %"], ["descontoVenda", "Vender abaixo da aval. %"]];

export default function EditorPadrao({ inicial, onSalvar, onCancelar }: { inicial: Padrao | null; onSalvar: (p: Padrao) => void; onCancelar?: () => void }) {
  const [p, setP] = useState<Padrao>(inicial ?? novoPadrao());
  const [passo, setPasso] = useState(inicial ? 3 : 0);
  const [cidadeTxt, setCidadeTxt] = useState("");
  const set = (k: keyof Padrao, v: unknown) => setP({ ...p, [k]: v });
  const num = (v: string) => Number(String(v).replace(/[^\d]/g, "")) || 0;
  const { imoveis: IMOVEIS } = useIndice(p.ufs);
  const cidades = useMemo(() => Array.from(new Set(IMOVEIS.filter((i) => p.ufs.length === 0 || p.ufs.includes(i.uf)).map((i) => i.cidade))).sort((a, b) => a.localeCompare(b, "pt-BR")), [p.ufs, IMOVEIS]);
  const previa = useMemo(() => { const av = IMOVEIS.map((i) => avaliarPadrao(i, p)); const ok = av.filter((a) => a.passa); return { passam: ok.length, alvo: ok.filter((a) => a.res.margem >= p.margemAlvo).length, melhor: ok.reduce((m, a) => Math.max(m, a.score), 0) }; }, [p, IMOVEIS]);
  const toggle = (k: "ufs" | "cidades" | "tipos" | "modalidades", v: string) => set(k, p[k].includes(v) ? p[k].filter((x) => x !== v) : [...p[k], v]);

  return (
    <div className="lote-grid">
      <div>
        {passo === 0 && (
          <div className="painel">
            <h2>Comece de um ponto de partida</h2>
            <p style={{ color: "var(--mute)", fontSize: 14, margin: "0 0 14px" }}>Escolha um preset ou parta do zero. Tudo pode ser mudado depois. Nenhuma regra é nossa: é o seu padrão.</p>
            <div className="difs">{PRESETS.map((pr) => <button key={pr.nome} className="passo" style={{ textAlign: "left", cursor: "pointer" }} onClick={() => { setP({ ...novoPadrao(pr.p), nome: pr.nome === "Em branco" ? "Meu padrão" : pr.nome }); setPasso(1); }}><h3>{pr.nome}</h3><p>{pr.desc}</p></button>)}</div>
          </div>)}
        {passo >= 1 && (<>
          <div className="painel">
            <h2>1 · Valores e margem</h2>
            <div className="custos">
              <label className="campo"><span>Nome do padrão</span><input value={p.nome} onChange={(e) => set("nome", e.target.value)} /></label>
              <label className="campo"><span>Avaliação de (R$, 0 = sem mínimo)</span><input className="mono" inputMode="numeric" value={p.faixaMin} onChange={(e) => set("faixaMin", num(e.target.value))} /></label>
              <label className="campo"><span>Avaliação até (R$, 0 = sem teto)</span><input className="mono" inputMode="numeric" value={p.faixaMax} onChange={(e) => set("faixaMax", num(e.target.value))} /></label>
              <label className="campo"><span>Lance máximo que você paga (R$, 0 = sem teto)</span><input className="mono" inputMode="numeric" value={p.lanceMax} onChange={(e) => set("lanceMax", num(e.target.value))} /></label>
              <label className="campo"><span>Deságio mínimo (%)</span><input className="mono" inputMode="numeric" value={Math.round(p.desagioMin * 100)} onChange={(e) => set("desagioMin", num(e.target.value) / 100)} /></label>
              <label className="campo"><span>Margem líquida mínima (%)</span><input className="mono" inputMode="numeric" value={Math.round(p.margemMin * 100)} onChange={(e) => set("margemMin", num(e.target.value) / 100)} /></label>
              <label className="campo"><span>Margem alvo (%)</span><input className="mono" inputMode="numeric" value={Math.round(p.margemAlvo * 100)} onChange={(e) => set("margemAlvo", num(e.target.value) / 100)} /></label>
            </div>
          </div>
          <div className="painel" style={{ marginTop: 14 }}>
            <h2>2 · Onde e o quê</h2>
            <p style={{ color: "var(--mute)", fontSize: 13.5, margin: "0 0 8px" }}>Nada marcado = Brasil inteiro, todos os tipos, todas as modalidades.</p>
            <h3 style={{ fontSize: 12, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--accent-ink)", margin: "10px 0 6px" }}>Estados</h3>
            <div className="chips" style={{ flexWrap: "wrap" }}>{UFS.map((u) => <button key={u} className={`chip ${p.ufs.includes(u) ? "on" : ""}`} onClick={() => toggle("ufs", u)}>{u}</button>)}</div>
            <h3 style={{ fontSize: 12, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--accent-ink)", margin: "14px 0 6px" }}>Cidades</h3>
            <div className="par"><label className="campo"><span>Adicionar cidade</span><input list="cidades-lista" value={cidadeTxt} onChange={(e) => setCidadeTxt(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && cidadeTxt.trim()) { toggle("cidades", cidadeTxt.trim()); setCidadeTxt(""); } }} placeholder="Digite e Enter" /><datalist id="cidades-lista">{cidades.slice(0, 400).map((c) => <option key={c} value={c} />)}</datalist></label></div>
            <div className="chips" style={{ flexWrap: "wrap", marginTop: 8 }}>{p.cidades.map((c) => <button key={c} className="chip on" onClick={() => toggle("cidades", c)}>{c} ×</button>)}{p.cidades.length === 0 && <span style={{ fontSize: 13, color: "var(--mute)" }}>Nenhuma cidade específica.</span>}</div>
            <h3 style={{ fontSize: 12, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--accent-ink)", margin: "14px 0 6px" }}>Tipos</h3>
            <div className="chips" style={{ flexWrap: "wrap" }}>{TIPOS.map((t) => <button key={t} className={`chip ${p.tipos.includes(t) ? "on" : ""}`} onClick={() => toggle("tipos", t)}>{t}</button>)}</div>
            <h3 style={{ fontSize: 12, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--accent-ink)", margin: "14px 0 6px" }}>Modalidades</h3>
            <div className="chips" style={{ flexWrap: "wrap" }}>{Object.entries(MODALIDADE_LABEL).map(([k, v]) => <button key={k} className={`chip ${p.modalidades.includes(k) ? "on" : ""}`} onClick={() => toggle("modalidades", k)}>{v}</button>)}</div>
            <div className="par" style={{ marginTop: 14 }}>
              <label className="campo"><span>Ocupação</span><select value={p.ocupacao} onChange={(e) => set("ocupacao", e.target.value)}><option value="qualquer">Aceito ocupado</option><option value="desocupado">Só desocupado confirmado</option></select></label>
              <label className="toggle" style={{ alignSelf: "end" }}><input type="checkbox" checked={p.exigeFinanciamento} onChange={(e) => set("exigeFinanciamento", e.target.checked)} />Só lotes que aceitam financiamento</label>
            </div>
          </div>
          <div className="painel" style={{ marginTop: 14 }}>
            <h2>3 · Vetos e custos</h2>
            <label className="toggle"><input type="checkbox" checked={p.vetoFiduciante} onChange={(e) => set("vetoFiduciante", e.target.checked)} />Vetar direitos de devedor fiduciante (dívida embutida)</label>
            <label className="toggle"><input type="checkbox" checked={p.vetoFracao} onChange={(e) => set("vetoFracao", e.target.checked)} />Vetar fração ideal (copropriedade)</label>
            <label className="toggle"><input type="checkbox" checked={p.vetoEdital} onChange={(e) => set("vetoEdital", e.target.checked)} />Tratar intimação por edital como veto (quando a fonte informar)</label>
            <h3 style={{ fontSize: 12, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--accent-ink)", margin: "14px 0 8px" }}>Seus custos</h3>
            <div className="custos">{CUSTOS.map(([k, l]) => <label className="campo" key={k}><span>{l}</span><input className="mono" type="number" value={p.custos[k]} onChange={(e) => set("custos", { ...p.custos, [k]: +e.target.value || 0 })} /></label>)}</div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}><button className="btn ouro" onClick={() => onSalvar(p)}>Salvar e usar este padrão</button>{onCancelar && <button className="btn sec" onClick={onCancelar}>Cancelar</button>}<button className="btn sec" onClick={() => setPasso(0)}>Trocar preset</button></div>
        </>)}
      </div>
      <aside className="lateral">
        <div className="ficha-cart"><div className="cab"><span>Prévia na coleta de hoje</span></div>
          <dl className="linhas">
            <div><dt>Passam</dt><dd><span className="num">{previa.passam.toLocaleString("pt-BR")}</span> <span style={{ color: "var(--mute)" }}>de {IMOVEIS.length.toLocaleString("pt-BR")}</span></dd></div>
            <div><dt>Na margem alvo</dt><dd><span className="num" style={{ color: "var(--ok)" }}>{previa.alvo.toLocaleString("pt-BR")}</span></dd></div>
            <div><dt>Melhor score</dt><dd><span className="num">{previa.melhor}</span></dd></div>
            <div><dt>Faixa</dt><dd>{p.faixaMin || p.faixaMax ? `${p.faixaMin ? brl(p.faixaMin) : "0"} a ${p.faixaMax ? brl(p.faixaMax) : "sem teto"}` : "qualquer valor"}</dd></div>
            <div><dt>Deságio</dt><dd>≥ {pct(p.desagioMin)}</dd></div>
            <div><dt>Margem</dt><dd>≥ {pct(p.margemMin)} · alvo {pct(p.margemAlvo)}</dd></div>
            <div><dt>Região</dt><dd className={p.ufs.length || p.cidades.length ? "" : "fraco"}>{[...p.ufs, ...p.cidades].join(", ") || "Brasil inteiro"}</dd></div>
            <div><dt>Tipos</dt><dd className={p.tipos.length ? "" : "fraco"}>{p.tipos.join(", ") || "todos"}</dd></div>
          </dl>
        </div>
        <p style={{ fontSize: 12.5, color: "var(--mute)", margin: 0 }}>A prévia recalcula a cada mudança. O score de cada lote passa a ser sobre estas regras.</p>
      </aside>
    </div>
  );
}
