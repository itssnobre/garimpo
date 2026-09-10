"use client";
import { useMemo, useState } from "react";
import { useIndice } from "@/lib/indice";
import { avaliarPadrao, MODALIDADE_LABEL, type Custos } from "@/lib/motor";
import { brl, pct } from "@/lib/fmt";
import { PRESETS, TIPOS, UFS, novoPadrao, type Padrao } from "@/lib/padrao";
import { useT } from "@/lib/i18n/client";

const CUSTOS: [keyof Custos, string][] = [["leiloeiro", "Leiloeiro %"], ["itbi", "ITBI % (padrão)"], ["registro", "Registro %"], ["advogado", "Advogado R$"], ["certidoes", "Certidões R$"], ["desocupacao", "Desocupação R$ (0 = automático)"], ["reforma", "Reforma R$"], ["meses", "Meses até vender"], ["mensal", "Custo mensal R$"], ["corretagem", "Corretagem %"], ["ir", "IR ganho capital %"], ["descontoVenda", "Vender abaixo da aval. %"]];

export default function EditorPadrao({ inicial, onSalvar, onCancelar }: { inicial: Padrao | null; onSalvar: (p: Padrao) => void; onCancelar?: () => void }) {
  const { t, lang } = useT();
  const loc = lang === "en" ? "en-US" : "pt-BR";
  const [p, setP] = useState<Padrao>(inicial ?? novoPadrao());
  const [passo, setPasso] = useState(inicial ? 3 : 0);
  const [cidadeTxt, setCidadeTxt] = useState("");
  const set = (k: keyof Padrao, v: unknown) => setP({ ...p, [k]: v });
  const num = (v: string) => Number(String(v).replace(/[^\d]/g, "")) || 0;
  const { imoveis: IMOVEIS } = useIndice(p.ufs);
  const cidades = useMemo(() => Array.from(new Set(IMOVEIS.filter((i) => p.ufs.length === 0 || p.ufs.includes(i.uf)).map((i) => i.cidade))).sort((a, b) => a.localeCompare(b, loc)), [p.ufs, IMOVEIS, loc]);
  const previa = useMemo(() => { const av = IMOVEIS.map((i) => avaliarPadrao(i, p)); const ok = av.filter((a) => a.passa); return { passam: ok.length, alvo: ok.filter((a) => a.res.margem >= p.margemAlvo).length, melhor: ok.reduce((m, a) => Math.max(m, a.score), 0) }; }, [p, IMOVEIS]);
  const toggle = (k: "ufs" | "cidades" | "tipos" | "modalidades", v: string) => set(k, p[k].includes(v) ? p[k].filter((x) => x !== v) : [...p[k], v]);

  return (
    <div className="lote-grid">
      <div>
        {passo === 0 && (
          <div className="painel">
            <h2>{t("Comece de um ponto de partida")}</h2>
            <p style={{ color: "var(--mute)", fontSize: 14, margin: "0 0 14px" }}>{t("Escolha um preset ou parta do zero. Tudo pode ser mudado depois. Nenhuma regra é nossa: é o seu padrão.")}</p>
            <div className="difs">{PRESETS.map((pr) => <button key={pr.nome} className="passo" style={{ textAlign: "left", cursor: "pointer" }} onClick={() => { setP({ ...novoPadrao(pr.p), nome: pr.nome === "Em branco" ? t("Meu padrão") : pr.nome }); setPasso(1); }}><h3>{t(pr.nome)}</h3><p>{t(pr.desc)}</p></button>)}</div>
          </div>)}
        {passo >= 1 && (<>
          <div className="painel">
            <h2>{t("1 · Valores e margem")}</h2>
            <div className="custos">
              <label className="campo"><span>{t("Nome do padrão")}</span><input value={p.nome} onChange={(e) => set("nome", e.target.value)} /></label>
              <label className="campo"><span>{t("Avaliação de (R$, 0 = sem mínimo)")}</span><input className="mono" inputMode="numeric" value={p.faixaMin} onChange={(e) => set("faixaMin", num(e.target.value))} /></label>
              <label className="campo"><span>{t("Avaliação até (R$, 0 = sem teto)")}</span><input className="mono" inputMode="numeric" value={p.faixaMax} onChange={(e) => set("faixaMax", num(e.target.value))} /></label>
              <label className="campo"><span>{t("Lance máximo que você paga (R$, 0 = sem teto)")}</span><input className="mono" inputMode="numeric" value={p.lanceMax} onChange={(e) => set("lanceMax", num(e.target.value))} /></label>
              <label className="campo"><span>{t("Deságio mínimo (%)")}</span><input className="mono" inputMode="numeric" value={Math.round(p.desagioMin * 100)} onChange={(e) => set("desagioMin", num(e.target.value) / 100)} /></label>
              <label className="campo"><span>{t("Margem líquida mínima (%)")}</span><input className="mono" inputMode="numeric" value={Math.round(p.margemMin * 100)} onChange={(e) => set("margemMin", num(e.target.value) / 100)} /></label>
              <label className="campo"><span>{t("Margem alvo (%)")}</span><input className="mono" inputMode="numeric" value={Math.round(p.margemAlvo * 100)} onChange={(e) => set("margemAlvo", num(e.target.value) / 100)} /></label>
            </div>
          </div>
          <div className="painel" style={{ marginTop: 14 }}>
            <h2>{t("2 · Onde e o quê")}</h2>
            <p style={{ color: "var(--mute)", fontSize: 13.5, margin: "0 0 8px" }}>{t("Nada marcado = Brasil inteiro, todos os tipos, todas as modalidades.")}</p>
            <h3 style={{ fontSize: 12, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--accent-ink)", margin: "10px 0 6px" }}>{t("Estados")}</h3>
            <div className="chips" style={{ flexWrap: "wrap" }}>{UFS.map((u) => <button key={u} className={`chip ${p.ufs.includes(u) ? "on" : ""}`} onClick={() => toggle("ufs", u)}>{u}</button>)}</div>
            <h3 style={{ fontSize: 12, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--accent-ink)", margin: "14px 0 6px" }}>{t("Cidades")}</h3>
            <div className="par"><label className="campo"><span>{t("Adicionar cidade")}</span><input list="cidades-lista" value={cidadeTxt} onChange={(e) => setCidadeTxt(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && cidadeTxt.trim()) { toggle("cidades", cidadeTxt.trim()); setCidadeTxt(""); } }} placeholder={t("Digite e Enter")} /><datalist id="cidades-lista">{cidades.slice(0, 400).map((c) => <option key={c} value={c} />)}</datalist></label></div>
            <div className="chips" style={{ flexWrap: "wrap", marginTop: 8 }}>{p.cidades.map((c) => <button key={c} className="chip on" onClick={() => toggle("cidades", c)}>{c} ×</button>)}{p.cidades.length === 0 && <span style={{ fontSize: 13, color: "var(--mute)" }}>{t("Nenhuma cidade específica.")}</span>}</div>
            <h3 style={{ fontSize: 12, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--accent-ink)", margin: "14px 0 6px" }}>{t("Tipos")}</h3>
            <div className="chips" style={{ flexWrap: "wrap" }}>{TIPOS.map((tp) => <button key={tp} className={`chip ${p.tipos.includes(tp) ? "on" : ""}`} onClick={() => toggle("tipos", tp)}>{tp}</button>)}</div>
            <h3 style={{ fontSize: 12, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--accent-ink)", margin: "14px 0 6px" }}>{t("Modalidades")}</h3>
            <div className="chips" style={{ flexWrap: "wrap" }}>{Object.entries(MODALIDADE_LABEL).map(([k, v]) => <button key={k} className={`chip ${p.modalidades.includes(k) ? "on" : ""}`} onClick={() => toggle("modalidades", k)}>{v}</button>)}</div>
            <h3 style={{ fontSize: 12, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--accent-ink)", margin: "14px 0 6px" }}>{t("Perfil do imóvel")}</h3>
            <p style={{ color: "var(--mute)", fontSize: 13, margin: "0 0 8px" }}>{t("Quando você exige quartos ou área, lote sem esse dado na fonte fica de fora.")}</p>
            <div className="custos">
              <label className="campo"><span>{t("Quartos, no mínimo")}</span><select value={p.quartosMin ?? 0} onChange={(e) => set("quartosMin", +e.target.value)}><option value={0}>{t("Qualquer")}</option>{[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}+</option>)}</select></label>
              <label className="campo"><span>{t("Área mínima (m², 0 = qualquer)")}</span><input className="mono" inputMode="numeric" value={p.areaMin ?? 0} onChange={(e) => set("areaMin", num(e.target.value))} /></label>
              <label className="campo"><span>{t("Área máxima (m², 0 = sem teto)")}</span><input className="mono" inputMode="numeric" value={p.areaMax ?? 0} onChange={(e) => set("areaMax", num(e.target.value))} /></label>
            </div>
            <div className="par" style={{ marginTop: 14 }}>
              <label className="campo"><span>{t("Ocupação")}</span><select value={p.ocupacao} onChange={(e) => set("ocupacao", e.target.value)}><option value="qualquer">{t("Aceito ocupado")}</option><option value="desocupado">{t("Só desocupado confirmado")}</option></select></label>
              <label className="toggle" style={{ alignSelf: "end" }}><input type="checkbox" checked={p.exigeFinanciamento} onChange={(e) => set("exigeFinanciamento", e.target.checked)} />{t("Só lotes que aceitam financiamento")}</label>
            </div>
          </div>
          <div className="painel" style={{ marginTop: 14 }}>
            <h2>{t("3 · Vetos e custos")}</h2>
            <label className="toggle"><input type="checkbox" checked={p.vetoFiduciante} onChange={(e) => set("vetoFiduciante", e.target.checked)} />{t("Vetar direitos de devedor fiduciante (dívida embutida)")}</label>
            <label className="toggle"><input type="checkbox" checked={p.vetoFracao} onChange={(e) => set("vetoFracao", e.target.checked)} />{t("Vetar fração ideal (copropriedade)")}</label>
            <label className="toggle"><input type="checkbox" checked={p.vetoEdital} onChange={(e) => set("vetoEdital", e.target.checked)} />{t("Tratar intimação por edital como veto (quando a fonte informar)")}</label>
            <h3 style={{ fontSize: 12, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--accent-ink)", margin: "14px 0 8px" }}>{t("Seus custos")}</h3>
            <div className="custos">{CUSTOS.map(([k, l]) => <label className="campo" key={k}><span>{t(l)}</span><input className="mono" type="number" value={p.custos[k]} onChange={(e) => set("custos", { ...p.custos, [k]: +e.target.value || 0 })} /></label>)}</div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}><button className="btn ouro" onClick={() => onSalvar(p)}>{t("Salvar e usar este padrão")}</button>{onCancelar && <button className="btn sec" onClick={onCancelar}>{t("Cancelar")}</button>}<button className="btn sec" onClick={() => setPasso(0)}>{t("Trocar preset")}</button></div>
        </>)}
      </div>
      <aside className="lateral">
        <div className="ficha-cart"><div className="cab"><span>{t("Prévia na coleta de hoje")}</span></div>
          <dl className="linhas">
            <div><dt>{t("Passam")}</dt><dd><span className="num">{previa.passam.toLocaleString(loc)}</span> <span style={{ color: "var(--mute)" }}>{t("de {n}", { n: IMOVEIS.length.toLocaleString(loc) })}</span></dd></div>
            <div><dt>{t("Na margem alvo")}</dt><dd><span className="num" style={{ color: "var(--ok)" }}>{previa.alvo.toLocaleString(loc)}</span></dd></div>
            <div><dt>{t("Melhor score")}</dt><dd><span className="num">{previa.melhor}</span></dd></div>
            <div><dt>{t("Faixa")}</dt><dd>{p.faixaMin || p.faixaMax ? t("{min} a {max}", { min: p.faixaMin ? brl(p.faixaMin) : "0", max: p.faixaMax ? brl(p.faixaMax) : t("sem teto") }) : t("qualquer valor")}</dd></div>
            <div><dt>{t("Deságio")}</dt><dd>≥ {pct(p.desagioMin)}</dd></div>
            <div><dt>{t("Margem")}</dt><dd>≥ {pct(p.margemMin)} · {t("alvo {v}", { v: pct(p.margemAlvo) })}</dd></div>
            <div><dt>{t("Região")}</dt><dd className={p.ufs.length || p.cidades.length ? "" : "fraco"}>{[...p.ufs, ...p.cidades].join(", ") || t("Brasil inteiro")}</dd></div>
            <div><dt>{t("Tipos")}</dt><dd className={p.tipos.length ? "" : "fraco"}>{p.tipos.join(", ") || t("todos")}</dd></div>
            <div><dt>{t("Perfil")}</dt><dd className={p.quartosMin || p.areaMin || p.areaMax ? "" : "fraco"}>{[p.quartosMin ? t("{n}+ quartos", { n: p.quartosMin }) : "", p.areaMin || p.areaMax ? t("{min} a {max} m²", { min: p.areaMin || 0, max: p.areaMax ? p.areaMax : "∞" }) : ""].filter(Boolean).join(" · ") || t("qualquer")}</dd></div>
          </dl>
        </div>
        <p style={{ fontSize: 12.5, color: "var(--mute)", margin: 0 }}>{t("A prévia recalcula a cada mudança. O score de cada lote passa a ser sobre estas regras.")}</p>
      </aside>
    </div>
  );
}
