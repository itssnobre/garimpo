"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import type { Imovel } from "@/lib/types";
import { avaliarPadrao, REGRAS_BASE, FONTE_LABEL, MODALIDADE_LABEL } from "@/lib/motor";
import { usePadroes } from "@/lib/usePadroes";
import { useFavoritos } from "@/lib/favoritos";
import Card from "./Card";
import { IEstrela, IFiltro } from "./Icones";

type Ordem = "score" | "margem" | "desagio" | "lance" | "data";
const ORDENS: [Ordem, string][] = [["score", "Melhor score"], ["margem", "Maior margem"], ["desagio", "Maior deságio"], ["lance", "Menor lance"], ["data", "Leilão mais próximo"]];

export default function Lista({ imoveis }: { imoveis: Imovel[] }) {
  const { ativo, lista: padroes, ativar, pronto } = usePadroes();
  const regras = ativo ?? REGRAS_BASE;
  const [cidade, setCidade] = useState(""); const [tipo, setTipo] = useState(""); const [fonte, setFonte] = useState(""); const [modalidade, setModalidade] = useState("");
  const [busca, setBusca] = useState(""); const [soPassam, setSoPassam] = useState(true); const [ocultarVeto, setOcultarVeto] = useState(true); const [soFoto, setSoFoto] = useState(false); const [soFavs, setSoFavs] = useState(false);
  const [ordem, setOrdem] = useState<Ordem>("score"); const [limite, setLimite] = useState(48);
  const { favs, toggle } = useFavoritos();

  const avaliados = useMemo(() => imoveis.map((i) => ({ i, a: avaliarPadrao(i, regras) })), [imoveis, regras]);
  const cidades = useMemo(() => Array.from(new Set(imoveis.map((i) => i.cidade))).sort((a, b) => a.localeCompare(b, "pt-BR")), [imoveis]);
  const fontes = useMemo(() => Array.from(new Set(imoveis.map((i) => i.fonte))).sort(), [imoveis]);
  const totalGo = useMemo(() => avaliados.filter((x) => x.a.classe === "go").length, [avaliados]);

  const lista = useMemo(() => {
    const q = busca.toLowerCase();
    const l = avaliados.filter(({ i, a }) =>
      (!cidade || i.cidade === cidade) && (!tipo || i.tipo === tipo) && (!fonte || i.fonte === fonte) && (!modalidade || i.modalidade === modalidade) &&
      (!ocultarVeto || !(i.direitos_fiduciante || i.fracao_ideal)) && (!soFoto || (i.fotos && i.fotos.length > 0)) && (!soFavs || favs.has(i.id)) &&
      (!soPassam || a.passa) &&
      (!q || `${i.titulo} ${i.endereco ?? ""} ${i.bairro ?? ""} ${i.cidade} ${i.matricula ?? ""}`.toLowerCase().includes(q)));
    const k: Record<Ordem, (x: (typeof l)[number]) => number | string> = { score: (x) => -x.a.score, margem: (x) => -x.a.res.margem, desagio: (x) => -x.i.desagio_pct, lance: (x) => x.i.lance_minimo, data: (x) => x.i.data_leilao ?? "9999" };
    return l.sort((x, y) => { const a = k[ordem](x), b = k[ordem](y); return a < b ? -1 : a > b ? 1 : 0; });
  }, [avaliados, cidade, tipo, fonte, modalidade, busca, soPassam, ocultarVeto, soFoto, soFavs, favs, ordem]);

  const go = lista.filter((x) => x.a.classe === "go").length;
  const limpar = () => { setCidade(""); setTipo(""); setFonte(""); setModalidade(""); setBusca(""); setSoPassam(true); setOcultarVeto(true); setSoFoto(false); setSoFavs(false); };

  return (
    <>
      <section className="faixa-hero">
        <div className="faixa-hero-in" style={{ display: "none" }}>
          <div><h1>Imóveis em leilão, <em>só o que paga a margem</em>.</h1>
            <p>{imoveis.length.toLocaleString("pt-BR")} lotes em SP de {fontes.length} fontes, recalculados com todos os custos. <b>{totalGo} passam no padrão</b> hoje.</p></div>
          <label className="busca-grande"><span className="sr">Buscar</span><input placeholder="Buscar por bairro, rua, cidade ou matrícula" value={busca} onChange={(e) => setBusca(e.target.value)} /></label>
        </div>
      </section>

      <div className="barra-filtros">
        <div className="barra-in">
          <div className="chips">
            <button className={`chip ${soPassam ? "on" : ""}`} aria-pressed={soPassam} onClick={() => setSoPassam(!soPassam)}>{ativo ? `Padrão: ${ativo.nome}` : "Meu padrão"}</button>
            {padroes.length > 1 && <select className="chip sel" value={ativo?.id ?? ""} onChange={(e) => ativar(e.target.value)} aria-label="Trocar padrão">{padroes.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select>}
            <button className={`chip ${soFoto ? "on" : ""}`} aria-pressed={soFoto} onClick={() => setSoFoto(!soFoto)}>Com foto</button>
            <button className={`chip ${!ocultarVeto ? "on" : ""}`} aria-pressed={!ocultarVeto} onClick={() => setOcultarVeto(!ocultarVeto)}>Mostrar vetados</button>
            <button className={`chip ${soFavs ? "on" : ""}`} aria-pressed={soFavs} onClick={() => setSoFavs(!soFavs)}><IEstrela cheia={soFavs} /> Favoritos{favs.size ? ` (${favs.size})` : ""}</button>
            <select className="chip sel" value={cidade} onChange={(e) => setCidade(e.target.value)} aria-label="Cidade"><option value="">Cidade: todas</option>{cidades.map((c) => <option key={c}>{c}</option>)}</select>
            <select className="chip sel" value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Tipo"><option value="">Tipo: todos</option>{["apartamento", "casa", "terreno", "comercial", "rural", "outro"].map((t) => <option key={t} value={t}>{t}</option>)}</select>
            <select className="chip sel" value={modalidade} onChange={(e) => setModalidade(e.target.value)} aria-label="Modalidade"><option value="">Modalidade: todas</option>{Object.entries(MODALIDADE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <select className="chip sel" value={fonte} onChange={(e) => setFonte(e.target.value)} aria-label="Fonte"><option value="">Fonte: todas</option>{fontes.map((f) => <option key={f} value={f}>{FONTE_LABEL[f] ?? f}</option>)}</select>
            <Link href="/app/padrao" className="chip"><IFiltro /> {ativo ? "Ajustar padrão" : "Criar meu padrão"}</Link>
          </div>
        </div>
      </div>

      <main className="conteudo">
        {pronto && !ativo && <div className="sinal info" style={{ marginBottom: 12 }}>Você ainda não definiu o seu padrão. Enquanto isso, a lista usa uma base neutra (deságio 30%+, margem 25%+, Brasil inteiro). <Link href="/app/padrao?novo=1" style={{ textDecoration: "underline" }}>Criar meu padrão</Link> leva 2 minutos.</div>}
        <div className="contagem"><div><b>{lista.length.toLocaleString("pt-BR")}</b> <span>{soPassam ? (ativo ? `lotes no padrão ${ativo.nome}` : "lotes no padrão neutro") : `lotes · ${go} GO`}</span></div>
          <label className="ordem"><span>Ordenar</span><select value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)}>{ORDENS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label></div>
        {lista.length === 0 ? <div className="vazio"><b>Nada passa nesse recorte</b>{soFavs ? "Você ainda não marcou favoritos. Toque na estrela de um lote pra guardar aqui." : "Afrouxe o seu padrão (faixa, deságio, margem ou região) ou desligue o chip do padrão pra ver tudo."}</div> : (
          <>
            <div className="grade">{lista.slice(0, limite).map(({ i, a }) => {
              return <Card key={i.id} i={i} a={a} fav={favs.has(i.id)} toggle={toggle} />;

            })}</div>
            {lista.length > limite && <p style={{ textAlign: "center", margin: 26 }}><button className="btn sec" onClick={() => setLimite(limite + 48)}>Mostrar mais {Math.min(48, lista.length - limite)} de {(lista.length - limite).toLocaleString("pt-BR")}</button></p>}
          </>
        )}
      </main>
    </>
  );
}
