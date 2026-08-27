"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Imovel } from "@/lib/types";
import { avaliarPadrao, REGRAS_BASE, FONTE_LABEL, MODALIDADE_LABEL } from "@/lib/motor";
import { usePadroes } from "@/lib/usePadroes";
import Card from "./Card";
import { useFavoritos } from "@/lib/favoritos";

type Ordem = "score" | "margem" | "desagio" | "lance" | "data";
const ORDENS: [Ordem, string][] = [["score", "Melhor score"], ["margem", "Maior margem"], ["desagio", "Maior deságio"], ["lance", "Menor lance"], ["data", "Leilão mais próximo"]];
const TIPOS = ["apartamento", "casa", "terreno", "comercial", "rural", "outro"];

const S = { width: 17, height: 17, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const Lupa = () => <svg {...S}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.6-3.6" /></svg>;
const Xis = ({ s = 15 }: { s?: number }) => <svg {...S} width={s} height={s}><path d="M6 6l12 12M18 6L6 18" /></svg>;
const Ajustes = () => <svg {...S}><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>;
const Seta = () => <svg {...S} width={13} height={13}><path d="M6 9l6 6 6-6" /></svg>;

export default function Lista({ imoveis }: { imoveis: Imovel[] }) {
  const { ativo, lista: padroes, ativar, pronto } = usePadroes();
  const regras = ativo ?? REGRAS_BASE;
  const [busca, setBusca] = useState(""); const [cidade, setCidade] = useState(""); const [tipo, setTipo] = useState(""); const [fonte, setFonte] = useState(""); const [modalidade, setModalidade] = useState("");
  const [soPassam, setSoPassam] = useState(true); const [ocultarVeto, setOcultarVeto] = useState(true); const [soFoto, setSoFoto] = useState(false); const [soFavs, setSoFavs] = useState(false);
  const [ordem, setOrdem] = useState<Ordem>("score"); const [limite, setLimite] = useState(48); const [painel, setPainel] = useState(false);
  const { favs, toggle } = useFavoritos();

  const avaliados = useMemo(() => imoveis.map((i) => ({ i, a: avaliarPadrao(i, regras) })), [imoveis, regras]);
  const cidades = useMemo(() => Array.from(new Set(imoveis.map((i) => i.cidade))).sort((a, b) => a.localeCompare(b, "pt-BR")), [imoveis]);
  const fontes = useMemo(() => Array.from(new Set(imoveis.map((i) => i.fonte))).sort(), [imoveis]);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const l = avaliados.filter(({ i, a }) =>
      (!cidade || i.cidade === cidade) && (!tipo || i.tipo === tipo) && (!fonte || i.fonte === fonte) && (!modalidade || i.modalidade === modalidade) &&
      (!ocultarVeto || !(i.direitos_fiduciante || i.fracao_ideal)) && (!soFoto || (i.fotos && i.fotos.length > 0)) && (!soFavs || favs.has(i.id)) &&
      (!soPassam || a.passa) &&
      (!q || `${i.titulo} ${i.endereco ?? ""} ${i.bairro ?? ""} ${i.cidade} ${i.uf} ${i.matricula ?? ""}`.toLowerCase().includes(q)));
    const k: Record<Ordem, (x: (typeof l)[number]) => number | string> = { score: (x) => -x.a.score, margem: (x) => -x.a.res.margem, desagio: (x) => -x.i.desagio_pct, lance: (x) => x.i.lance_minimo, data: (x) => x.i.data_leilao ?? "9999" };
    return l.sort((x, y) => { const a = k[ordem](x), b = k[ordem](y); return a < b ? -1 : a > b ? 1 : 0; });
  }, [avaliados, cidade, tipo, fonte, modalidade, busca, soPassam, ocultarVeto, soFoto, soFavs, favs, ordem]);

  const pills = [
    soPassam && { k: "padrao", txt: ativo ? `Padrão: ${ativo.nome}` : "Padrão neutro", off: () => setSoPassam(false), destaque: true },
    cidade && { k: "cidade", txt: cidade, off: () => setCidade("") },
    tipo && { k: "tipo", txt: tipo, off: () => setTipo("") },
    modalidade && { k: "mod", txt: MODALIDADE_LABEL[modalidade], off: () => setModalidade("") },
    fonte && { k: "fonte", txt: FONTE_LABEL[fonte] ?? fonte, off: () => setFonte("") },
    soFoto && { k: "foto", txt: "Com foto", off: () => setSoFoto(false) },
    soFavs && { k: "favs", txt: "Favoritos", off: () => setSoFavs(false) },
    !ocultarVeto && { k: "veto", txt: "Mostrando vetados", off: () => setOcultarVeto(true) },
    busca && { k: "busca", txt: `"${busca}"`, off: () => setBusca("") },
  ].filter(Boolean) as { k: string; txt: string; off: () => void; destaque?: boolean }[];
  const nFiltros = pills.filter((p) => p.k !== "padrao" && p.k !== "busca").length;
  useEffect(() => { document.body.classList.toggle("travado", painel); return () => document.body.classList.remove("travado"); }, [painel]);
  const limpar = () => { setCidade(""); setTipo(""); setFonte(""); setModalidade(""); setBusca(""); setSoFoto(false); setSoFavs(false); setOcultarVeto(true); setSoPassam(true); };

  return (
    <>
      <div className="fbar">
        <div className="fbar-linha">
          <div className="fbusca">
            <Lupa />
            <input value={busca} onChange={(e) => { setBusca(e.target.value); setLimite(48); }} placeholder="Buscar cidade, bairro, rua ou matrícula" aria-label="Buscar" />
            {busca && <button className="limpar" onClick={() => setBusca("")} aria-label="Limpar busca"><Xis /></button>}
          </div>
          <button className={`fbtn so-icone ${nFiltros ? "on" : ""}`} onClick={() => setPainel(true)} aria-expanded={painel}><Ajustes /><span>Filtros</span>{nFiltros > 0 && <i className="conta">{nFiltros}</i>}</button>
          <div className="fordenar">
            <select value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)} aria-label="Ordenar">{ORDENS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <Seta />
          </div>
          {painel && (<>
            <div className="fpanel-fundo" onClick={() => setPainel(false)} />
            <div className="fpanel" role="dialog" aria-label="Filtros">
              <div className="fpanel-cab"><b>Filtros</b><button className="btn ghost mini" onClick={() => setPainel(false)} aria-label="Fechar"><Xis s={18} /></button></div>
              <div className="fpanel-corpo">
                <div className="fgrupo">
                  <h4>Meu padrão</h4>
                  <label className="toggle"><input type="checkbox" checked={soPassam} onChange={(e) => setSoPassam(e.target.checked)} />Mostrar só o que passa {ativo ? `no padrão "${ativo.nome}"` : "no padrão neutro"}</label>
                  {padroes.length > 1 && <select className="fseletor" style={{ marginTop: 8 }} value={ativo?.id ?? ""} onChange={(e) => ativar(e.target.value)} aria-label="Padrão ativo">{padroes.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select>}
                  <p style={{ margin: "10px 0 0", fontSize: 13 }}><Link href="/app/padrao" style={{ color: "var(--accent-ink)", fontWeight: 600 }}>{ativo ? "Ajustar minhas regras →" : "Criar meu padrão →"}</Link></p>
                </div>
                <div className="fgrupo">
                  <h4>Localização</h4>
                  <select className="fseletor" value={cidade} onChange={(e) => setCidade(e.target.value)} aria-label="Cidade"><option value="">Todas as cidades ({cidades.length})</option>{cidades.map((c) => <option key={c}>{c}</option>)}</select>
                </div>
                <div className="fgrupo">
                  <h4>Tipo de imóvel</h4>
                  <div className="fopcoes"><button className={`fopcao ${!tipo ? "on" : ""}`} onClick={() => setTipo("")}>Todos</button>{TIPOS.map((t) => <button key={t} className={`fopcao ${tipo === t ? "on" : ""}`} onClick={() => setTipo(tipo === t ? "" : t)}>{t}</button>)}</div>
                </div>
                <div className="fgrupo">
                  <h4>Modalidade</h4>
                  <div className="fopcoes"><button className={`fopcao ${!modalidade ? "on" : ""}`} onClick={() => setModalidade("")}>Todas</button>{Object.entries(MODALIDADE_LABEL).map(([k, v]) => <button key={k} className={`fopcao ${modalidade === k ? "on" : ""}`} onClick={() => setModalidade(modalidade === k ? "" : k)}>{v}</button>)}</div>
                </div>
                <div className="fgrupo">
                  <h4>Fonte</h4>
                  <div className="fopcoes"><button className={`fopcao ${!fonte ? "on" : ""}`} onClick={() => setFonte("")}>Todas</button>{fontes.map((f) => <button key={f} className={`fopcao ${fonte === f ? "on" : ""}`} onClick={() => setFonte(fonte === f ? "" : f)}>{FONTE_LABEL[f] ?? f}</button>)}</div>
                </div>
                <div className="fgrupo">
                  <h4>Exibição</h4>
                  <label className="toggle"><input type="checkbox" checked={soFoto} onChange={(e) => setSoFoto(e.target.checked)} />Só lotes com foto</label>
                  <label className="toggle"><input type="checkbox" checked={soFavs} onChange={(e) => setSoFavs(e.target.checked)} />Só meus favoritos{favs.size ? ` (${favs.size})` : ""}</label>
                  <label className="toggle"><input type="checkbox" checked={!ocultarVeto} onChange={(e) => setOcultarVeto(!e.target.checked)} />Mostrar lotes vetados</label>
                  <div style={{ marginTop: 10 }} className="fordenar-mobile">
                    <label className="campo"><span>Ordenar por</span><select value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)}>{ORDENS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                  </div>
                </div>
              </div>
              <div className="fpanel-pe"><button className="btn sec" onClick={limpar}>Limpar</button><button className="btn ouro" onClick={() => setPainel(false)}>Ver {lista.length.toLocaleString("pt-BR")} lotes</button></div>
            </div>
          </>)}
        </div>
        {pills.length > 0 && (
          <div className="fpills">
            {pills.map((p) => <span key={p.k} className={`fpill ${p.destaque ? "padrao" : ""}`}>{p.txt}<button onClick={p.off} aria-label={`Remover ${p.txt}`}><Xis s={13} /></button></span>)}
            {pills.length > 1 && <button className="limpar-tudo" onClick={limpar}>Limpar tudo</button>}
          </div>)}
      </div>

      {pronto && !ativo && (
        <div className="sinal info" style={{ margin: "0 0 16px" }}>Você ainda não definiu o seu padrão. A lista usa uma base neutra (deságio 30%, margem 25%, Brasil inteiro). <Link href="/app/padrao?novo=1" style={{ fontWeight: 600, textDecoration: "underline" }}>Criar meu padrão</Link> leva 2 minutos.</div>)}

      <div className="contagem">
        <div><b>{lista.length.toLocaleString("pt-BR")}</b> <span>{soPassam ? (ativo ? `lotes no padrão ${ativo.nome}` : "lotes no padrão neutro") : "lotes"}</span></div>
        <span style={{ color: "var(--mute)", fontSize: 13 }}>de {imoveis.length.toLocaleString("pt-BR")} coletados</span>
      </div>

      {lista.length === 0 ? (
        <div className="vazio"><b>Nada encontrado</b>{soFavs ? "Você ainda não marcou favoritos. Toque na estrela de um lote para guardar aqui." : "Afrouxe o seu padrão (faixa, deságio, margem ou região) ou remova algum filtro."}</div>
      ) : (<>
        <div className="grade">{lista.slice(0, limite).map(({ i, a }) => <Card key={i.id} i={i} a={a} fav={favs.has(i.id)} toggle={toggle} />)}</div>
        {lista.length > limite && <p style={{ textAlign: "center", margin: 28 }}><button className="btn sec" onClick={() => setLimite(limite + 48)}>Mostrar mais {Math.min(48, lista.length - limite)} de {(lista.length - limite).toLocaleString("pt-BR")}</button></p>}
      </>)}
    </>
  );
}
