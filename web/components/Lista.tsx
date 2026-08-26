"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import type { Imovel } from "@/lib/types";
import { avaliar, brl, pct, CRITERIOS_PADRAO, FONTE_LABEL, MODALIDADE_LABEL, type Criterios } from "@/lib/motor";
import Regua from "./Regua";

type Ordem = "score" | "margem" | "desagio" | "lance" | "data";
const ORDENS: [Ordem, string][] = [["score", "Score"], ["margem", "Margem"], ["desagio", "Deságio"], ["lance", "Menor lance"], ["data", "Leilão mais próximo"]];

export default function Lista({ imoveis }: { imoveis: Imovel[] }) {
  const [crit, setCrit] = useState<Criterios>(CRITERIOS_PADRAO);
  const [cidade, setCidade] = useState(""); const [tipo, setTipo] = useState(""); const [fonte, setFonte] = useState(""); const [modalidade, setModalidade] = useState("");
  const [busca, setBusca] = useState(""); const [soPassam, setSoPassam] = useState(true); const [ocultarVeto, setOcultarVeto] = useState(true); const [soFoto, setSoFoto] = useState(false);
  const [ordem, setOrdem] = useState<Ordem>("score"); const [limite, setLimite] = useState(60);

  const avaliados = useMemo(() => imoveis.map((i) => ({ i, a: avaliar(i, crit) })), [imoveis, crit]);
  const cidades = useMemo(() => Array.from(new Set(imoveis.map((i) => i.cidade))).sort((a, b) => a.localeCompare(b, "pt-BR")), [imoveis]);
  const fontes = useMemo(() => Array.from(new Set(imoveis.map((i) => i.fonte))).sort(), [imoveis]);

  const lista = useMemo(() => {
    const q = busca.toLowerCase();
    const l = avaliados.filter(({ i, a }) =>
      (!cidade || i.cidade === cidade) && (!tipo || i.tipo === tipo) && (!fonte || i.fonte === fonte) && (!modalidade || i.modalidade === modalidade) &&
      (!crit.soRegiao || a.regiao !== "Outra") && (!ocultarVeto || !(i.direitos_fiduciante || i.fracao_ideal)) && (!soFoto || (i.fotos && i.fotos.length > 0)) &&
      (!soPassam || (i.avaliacao >= crit.faixaMin && i.avaliacao <= crit.faixaMax && i.desagio_pct >= crit.desagioMin && a.res.margem >= crit.margemMin)) &&
      (!q || `${i.titulo} ${i.endereco ?? ""} ${i.bairro ?? ""} ${i.cidade} ${i.matricula ?? ""}`.toLowerCase().includes(q)));
    const k: Record<Ordem, (x: (typeof l)[number]) => number | string> = { score: (x) => -x.a.score, margem: (x) => -x.a.res.margem, desagio: (x) => -x.i.desagio_pct, lance: (x) => x.i.lance_minimo, data: (x) => x.i.data_leilao ?? "9999" };
    return l.sort((x, y) => { const a = k[ordem](x), b = k[ordem](y); return a < b ? -1 : a > b ? 1 : 0; });
  }, [avaliados, cidade, tipo, fonte, modalidade, busca, soPassam, ocultarVeto, soFoto, ordem, crit]);

  const num = (v: string) => Number(v.replace(/\D/g, "")) || 0;
  const go = lista.filter((x) => x.a.classe === "go").length;

  return (
    <div className="pagina">
      <aside className="trilho">
        <div className="bloco">
          <h3>Padrão do garimpo</h3>
          <div className="par">
            <label className="campo"><span>Avaliação de</span><input className="mono" inputMode="numeric" value={crit.faixaMin} onChange={(e) => setCrit({ ...crit, faixaMin: num(e.target.value) })} /></label>
            <label className="campo"><span>até</span><input className="mono" inputMode="numeric" value={crit.faixaMax} onChange={(e) => setCrit({ ...crit, faixaMax: num(e.target.value) })} /></label>
            <label className="campo"><span>Deságio mínimo %</span><input className="mono" inputMode="numeric" value={Math.round(crit.desagioMin * 100)} onChange={(e) => setCrit({ ...crit, desagioMin: num(e.target.value) / 100 })} /></label>
            <label className="campo"><span>Margem líquida mín. %</span><input className="mono" inputMode="numeric" value={Math.round(crit.margemMin * 100)} onChange={(e) => setCrit({ ...crit, margemMin: num(e.target.value) / 100 })} /></label>
          </div>
          <label className="toggle"><input type="checkbox" checked={soPassam} onChange={(e) => setSoPassam(e.target.checked)} />Só os que passam no padrão</label>
          <label className="toggle"><input type="checkbox" checked={crit.soRegiao} onChange={(e) => setCrit({ ...crit, soRegiao: e.target.checked })} />Só Sorocaba e ABC</label>
          <label className="toggle"><input type="checkbox" checked={ocultarVeto} onChange={(e) => setOcultarVeto(e.target.checked)} />Ocultar vetados</label>
          <label className="toggle"><input type="checkbox" checked={soFoto} onChange={(e) => setSoFoto(e.target.checked)} />Só com foto</label>
        </div>
        <div className="bloco">
          <h3>Recorte</h3>
          <label className="campo"><span>Buscar</span><input placeholder="bairro, rua, matrícula" value={busca} onChange={(e) => setBusca(e.target.value)} /></label>
          <label className="campo"><span>Cidade</span><select value={cidade} onChange={(e) => setCidade(e.target.value)}><option value="">Todas ({cidades.length})</option>{cidades.map((c) => <option key={c}>{c}</option>)}</select></label>
          <div className="par">
            <label className="campo"><span>Tipo</span><select value={tipo} onChange={(e) => setTipo(e.target.value)}><option value="">Todos</option>{["apartamento", "casa", "terreno", "comercial", "rural", "outro"].map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
            <label className="campo"><span>Modalidade</span><select value={modalidade} onChange={(e) => setModalidade(e.target.value)}><option value="">Todas</option>{Object.entries(MODALIDADE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          </div>
          <label className="campo"><span>Fonte</span><select value={fonte} onChange={(e) => setFonte(e.target.value)}><option value="">Todas</option>{fontes.map((f) => <option key={f} value={f}>{FONTE_LABEL[f] ?? f}</option>)}</select></label>
        </div>
      </aside>

      <main>
        <div className="contagem"><div><b>{lista.length}</b> <span>lotes · {go} GO</span></div>
          <div className="ordenar" role="group" aria-label="Ordenar">{ORDENS.map(([k, v]) => <button key={k} aria-pressed={ordem === k} onClick={() => setOrdem(k)}>{v}</button>)}</div></div>
        {lista.length === 0 ? <div className="vazio"><b>Nada passa nesse recorte</b>Abra a faixa de avaliação, baixe o deságio mínimo ou desmarque "Só os que passam no padrão".</div> : (
          <>
            <div className="grade">{lista.slice(0, limite).map(({ i, a }) => {
              const veto = i.direitos_fiduciante || i.fracao_ideal;
              return (
                <Link key={i.id} href={`/imovel/${encodeURIComponent(i.id)}`} className="ficha" aria-label={i.titulo}>
                  <div className="foto">
                    {i.fotos?.[0] ? <img src={i.fotos[0]} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <div className="semfoto">{i.tipo} · sem foto</div>}
                    <span className="fonte-tag">{FONTE_LABEL[i.fonte] ?? i.fonte} · {MODALIDADE_LABEL[i.modalidade]}</span>
                    <div className={`selo ${a.classe}`}>{a.score}<small>{a.classe === "go" ? "GO" : a.classe === "atencao" ? "ATENÇÃO" : "NO-GO"}</small></div>
                  </div>
                  <div className="ficha-corpo">
                    <h2 className="ficha-tit">{i.titulo}</h2>
                    <div className="ficha-sub"><b>{i.cidade}</b>{i.bairro ? `, ${i.bairro}` : ""}{a.regiao !== "Outra" && <span className="regiao-tag">{a.regiao}</span>}<br />
                      {[i.area_privativa_m2 ? `${i.area_privativa_m2} m²` : i.area_terreno_m2 ? `${i.area_terreno_m2} m² terreno` : null, i.quartos ? `${i.quartos} dorm.` : null, i.vagas ? `${i.vagas} vaga${i.vagas > 1 ? "s" : ""}` : null, i.ocupado === true ? "ocupado" : i.ocupado === false ? "desocupado" : null, i.matricula ? `matr. ${i.matricula}` : null].filter(Boolean).join(" · ") || "sem detalhes na fonte"}</div>
                    {veto ? <div className="veto-faixa">VETO · {i.direitos_fiduciante ? "direitos de fiduciante" : "fração ideal"}</div> : (
                      <div className="valores">
                        <div><span>Lance mínimo</span><b>{brl(i.lance_minimo)}<s>{brl(i.avaliacao)}</s></b></div>
                        <div><span>Deságio · margem</span><b>{pct(i.desagio_pct)} · <span style={{ color: a.res.margem >= 0.25 ? "var(--go)" : "var(--stop)", fontSize: 15, letterSpacing: 0, textTransform: "none" }}>{pct(a.res.margem)}</span></b></div>
                      </div>)}
                    {!veto && <Regua minimo={i.lance_minimo} avaliacao={i.avaliacao} max25={a.res.lanceMax25} max30={a.res.lanceMax30} max35={a.res.lanceMax35} />}
                    <div className="ficha-pe"><span>{i.data_leilao ? `${i.praca ? i.praca + "ª praça · " : ""}${new Date(i.data_leilao + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}` : "sem data na fonte"}</span><span className="mono">{a.motivos[0]}</span></div>
                  </div>
                </Link>);
            })}</div>
            {lista.length > limite && <p style={{ textAlign: "center", margin: 22 }}><button className="btn sec" onClick={() => setLimite(limite + 60)}>Mostrar mais {Math.min(60, lista.length - limite)} de {lista.length - limite}</button></p>}
          </>
        )}
      </main>
    </div>
  );
}
