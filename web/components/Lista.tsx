"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import type { Imovel } from "@/lib/types";
import { avaliar, brl, pct, CRITERIOS_PADRAO, FONTE_LABEL, MODALIDADE_LABEL, type Criterios } from "@/lib/motor";
import { urgencia } from "@/lib/util";
import { useFavoritos } from "@/lib/favoritos";
import Regua from "./Regua";
import { IArea, ICama, ICarro, IEstrela, IFiltro, IChave } from "./Icones";

type Ordem = "score" | "margem" | "desagio" | "lance" | "data";
const ORDENS: [Ordem, string][] = [["score", "Melhor score"], ["margem", "Maior margem"], ["desagio", "Maior deságio"], ["lance", "Menor lance"], ["data", "Leilão mais próximo"]];

export default function Lista({ imoveis }: { imoveis: Imovel[] }) {
  const [crit, setCrit] = useState<Criterios>(CRITERIOS_PADRAO);
  const [cidade, setCidade] = useState(""); const [tipo, setTipo] = useState(""); const [fonte, setFonte] = useState(""); const [modalidade, setModalidade] = useState("");
  const [busca, setBusca] = useState(""); const [soPassam, setSoPassam] = useState(true); const [ocultarVeto, setOcultarVeto] = useState(true); const [soFoto, setSoFoto] = useState(false); const [soFavs, setSoFavs] = useState(false);
  const [ordem, setOrdem] = useState<Ordem>("score"); const [limite, setLimite] = useState(48); const [mais, setMais] = useState(false);
  const { favs, toggle } = useFavoritos();

  const avaliados = useMemo(() => imoveis.map((i) => ({ i, a: avaliar(i, crit) })), [imoveis, crit]);
  const cidades = useMemo(() => Array.from(new Set(imoveis.map((i) => i.cidade))).sort((a, b) => a.localeCompare(b, "pt-BR")), [imoveis]);
  const fontes = useMemo(() => Array.from(new Set(imoveis.map((i) => i.fonte))).sort(), [imoveis]);
  const totalGo = useMemo(() => avaliados.filter((x) => x.a.classe === "go").length, [avaliados]);

  const lista = useMemo(() => {
    const q = busca.toLowerCase();
    const l = avaliados.filter(({ i, a }) =>
      (!cidade || i.cidade === cidade) && (!tipo || i.tipo === tipo) && (!fonte || i.fonte === fonte) && (!modalidade || i.modalidade === modalidade) &&
      (!crit.soRegiao || a.regiao !== "Outra") && (!ocultarVeto || !(i.direitos_fiduciante || i.fracao_ideal)) && (!soFoto || (i.fotos && i.fotos.length > 0)) && (!soFavs || favs.has(i.id)) &&
      (!soPassam || (i.avaliacao >= crit.faixaMin && i.avaliacao <= crit.faixaMax && i.desagio_pct >= crit.desagioMin && a.res.margem >= crit.margemMin)) &&
      (!q || `${i.titulo} ${i.endereco ?? ""} ${i.bairro ?? ""} ${i.cidade} ${i.matricula ?? ""}`.toLowerCase().includes(q)));
    const k: Record<Ordem, (x: (typeof l)[number]) => number | string> = { score: (x) => -x.a.score, margem: (x) => -x.a.res.margem, desagio: (x) => -x.i.desagio_pct, lance: (x) => x.i.lance_minimo, data: (x) => x.i.data_leilao ?? "9999" };
    return l.sort((x, y) => { const a = k[ordem](x), b = k[ordem](y); return a < b ? -1 : a > b ? 1 : 0; });
  }, [avaliados, cidade, tipo, fonte, modalidade, busca, soPassam, ocultarVeto, soFoto, soFavs, favs, ordem, crit]);

  const num = (v: string) => Number(v.replace(/\D/g, "")) || 0;
  const go = lista.filter((x) => x.a.classe === "go").length;
  const limpar = () => { setCrit(CRITERIOS_PADRAO); setCidade(""); setTipo(""); setFonte(""); setModalidade(""); setBusca(""); setSoPassam(true); setOcultarVeto(true); setSoFoto(false); setSoFavs(false); };

  return (
    <>
      <section className="faixa-hero">
        <div className="faixa-hero-in">
          <div><h1>Imóveis em leilão, <em>só o que paga a margem</em>.</h1>
            <p>{imoveis.length.toLocaleString("pt-BR")} lotes em SP de {fontes.length} fontes, recalculados com todos os custos. <b>{totalGo} passam no padrão</b> hoje.</p></div>
          <label className="busca-grande"><span className="sr">Buscar</span><input placeholder="Buscar por bairro, rua, cidade ou matrícula" value={busca} onChange={(e) => setBusca(e.target.value)} /></label>
        </div>
      </section>

      <div className="barra-filtros">
        <div className="barra-in">
          <div className="chips">
            <button className={`chip ${soPassam ? "on" : ""}`} aria-pressed={soPassam} onClick={() => setSoPassam(!soPassam)}>Padrão do garimpo</button>
            <button className={`chip ${crit.soRegiao ? "on" : ""}`} aria-pressed={crit.soRegiao} onClick={() => setCrit({ ...crit, soRegiao: !crit.soRegiao })}>Sorocaba + ABC</button>
            <button className={`chip ${soFoto ? "on" : ""}`} aria-pressed={soFoto} onClick={() => setSoFoto(!soFoto)}>Com foto</button>
            <button className={`chip ${!ocultarVeto ? "on" : ""}`} aria-pressed={!ocultarVeto} onClick={() => setOcultarVeto(!ocultarVeto)}>Mostrar vetados</button>
            <button className={`chip ${soFavs ? "on" : ""}`} aria-pressed={soFavs} onClick={() => setSoFavs(!soFavs)}><IEstrela cheia={soFavs} /> Favoritos{favs.size ? ` (${favs.size})` : ""}</button>
            <select className="chip sel" value={cidade} onChange={(e) => setCidade(e.target.value)} aria-label="Cidade"><option value="">Cidade: todas</option>{cidades.map((c) => <option key={c}>{c}</option>)}</select>
            <select className="chip sel" value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Tipo"><option value="">Tipo: todos</option>{["apartamento", "casa", "terreno", "comercial", "rural", "outro"].map((t) => <option key={t} value={t}>{t}</option>)}</select>
            <select className="chip sel" value={modalidade} onChange={(e) => setModalidade(e.target.value)} aria-label="Modalidade"><option value="">Modalidade: todas</option>{Object.entries(MODALIDADE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <select className="chip sel" value={fonte} onChange={(e) => setFonte(e.target.value)} aria-label="Fonte"><option value="">Fonte: todas</option>{fontes.map((f) => <option key={f} value={f}>{FONTE_LABEL[f] ?? f}</option>)}</select>
            <button className={`chip ${mais ? "on" : ""}`} aria-expanded={mais} onClick={() => setMais(!mais)}><IFiltro /> Régua do padrão</button>
          </div>
          {mais && <div className="mais-filtros">
            <label className="campo"><span>Avaliação de (R$)</span><input className="mono" inputMode="numeric" value={crit.faixaMin} onChange={(e) => setCrit({ ...crit, faixaMin: num(e.target.value) })} /></label>
            <label className="campo"><span>Avaliação até (R$)</span><input className="mono" inputMode="numeric" value={crit.faixaMax} onChange={(e) => setCrit({ ...crit, faixaMax: num(e.target.value) })} /></label>
            <label className="campo"><span>Deságio mínimo (%)</span><input className="mono" inputMode="numeric" value={Math.round(crit.desagioMin * 100)} onChange={(e) => setCrit({ ...crit, desagioMin: num(e.target.value) / 100 })} /></label>
            <label className="campo"><span>Margem líquida mínima (%)</span><input className="mono" inputMode="numeric" value={Math.round(crit.margemMin * 100)} onChange={(e) => setCrit({ ...crit, margemMin: num(e.target.value) / 100 })} /></label>
            <button className="btn sec" onClick={limpar} style={{ alignSelf: "end" }}>Limpar tudo</button>
          </div>}
        </div>
      </div>

      <main className="conteudo">
        <div className="contagem"><div><b>{lista.length.toLocaleString("pt-BR")}</b> <span>lotes · {go} GO</span></div>
          <label className="ordem"><span>Ordenar</span><select value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)}>{ORDENS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label></div>
        {lista.length === 0 ? <div className="vazio"><b>Nada passa nesse recorte</b>{soFavs ? "Você ainda não marcou favoritos. Toque na estrela de um lote pra guardar aqui." : "Abra a faixa de avaliação, baixe o deságio mínimo ou desligue o chip \"Padrão do garimpo\"."}</div> : (
          <>
            <div className="grade">{lista.slice(0, limite).map(({ i, a }) => {
              const veto = i.direitos_fiduciante || i.fracao_ideal; const u = urgencia(i.data_leilao); const fav = favs.has(i.id);
              return (
                <article key={i.id} className="ficha">
                  <Link href={`/imovel/${encodeURIComponent(i.id)}`} className="foto" aria-label={i.titulo}>
                    {i.fotos?.[0] ? <img src={i.fotos[0]} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <div className="semfoto">{i.tipo} · sem foto</div>}
                    <span className="fonte-tag">{FONTE_LABEL[i.fonte] ?? i.fonte} · {MODALIDADE_LABEL[i.modalidade]}</span>
                    {u && <span className={`urg ${u.nivel}`}>{u.txt}</span>}
                    <div className={`selo ${a.classe}`}>{a.score}<small>{a.classe === "go" ? "GO" : a.classe === "atencao" ? "ATENÇÃO" : "NO-GO"}</small></div>
                  </Link>
                  <button className={`fav ${fav ? "on" : ""}`} aria-label={fav ? "Tirar dos favoritos" : "Guardar nos favoritos"} aria-pressed={fav} onClick={() => toggle(i.id)}><IEstrela cheia={fav} /></button>
                  <div className="ficha-corpo">
                    <div className="preco-linha">
                      <div className="preco"><b>{brl(i.lance_minimo)}</b>{i.avaliacao > i.lance_minimo && <s>{brl(i.avaliacao)}</s>}</div>
                      {!veto && <div className="preco-tags"><span className="tag-desc">-{pct(i.desagio_pct)}</span><span className={`tag-marg ${a.res.margem >= 0.25 ? "ok" : "ruim"}`}>margem {pct(a.res.margem)}</span></div>}
                    </div>
                    <Link href={`/imovel/${encodeURIComponent(i.id)}`}><h2 className="ficha-tit">{i.titulo}</h2></Link>
                    <div className="ficha-sub"><b>{i.cidade}</b>{i.bairro ? `, ${i.bairro}` : ""}{i.endereco ? ` · ${i.endereco}` : ""}{a.regiao !== "Outra" && <span className="regiao-tag">{a.regiao}</span>}</div>
                    <ul className="fatos">
                      {i.area_privativa_m2 ? <li><IArea />{i.area_privativa_m2} m²</li> : i.area_terreno_m2 ? <li><IArea />{i.area_terreno_m2} m² terr.</li> : null}
                      {i.quartos ? <li><ICama />{i.quartos} dorm.</li> : null}
                      {i.vagas ? <li><ICarro />{i.vagas} vaga{i.vagas > 1 ? "s" : ""}</li> : null}
                      {i.ocupado !== null && i.ocupado !== undefined ? <li><IChave />{i.ocupado ? "ocupado" : "desocupado"}</li> : null}
                      {i.matricula ? <li className="mono">matr. {i.matricula}</li> : null}
                    </ul>
                    {veto ? <div className="veto-faixa">VETO · {i.direitos_fiduciante ? "direitos de fiduciante" : "fração ideal"}</div>
                      : <Regua minimo={i.lance_minimo} avaliacao={i.avaliacao} max25={a.res.lanceMax25} max30={a.res.lanceMax30} max35={a.res.lanceMax35} />}
                    <div className="ficha-pe"><span>{i.data_leilao ? `${i.praca ? i.praca + "ª praça · " : ""}${new Date(i.data_leilao + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}` : "sem data na fonte"}</span><Link href={`/imovel/${encodeURIComponent(i.id)}`} className="ver">Ver análise →</Link></div>
                  </div>
                </article>);
            })}</div>
            {lista.length > limite && <p style={{ textAlign: "center", margin: 26 }}><button className="btn sec" onClick={() => setLimite(limite + 48)}>Mostrar mais {Math.min(48, lista.length - limite)} de {(lista.length - limite).toLocaleString("pt-BR")}</button></p>}
          </>
        )}
      </main>
    </>
  );
}
