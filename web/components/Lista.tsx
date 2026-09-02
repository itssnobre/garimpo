"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Imovel } from "@/lib/types";
import { avaliarPadrao, FONTE_LABEL, MODALIDADE_LABEL, noPerfil, type Avaliacao } from "@/lib/motor";
import { brl } from "@/lib/fmt";
import { usePadroes } from "@/lib/usePadroes";
import Card from "./Card";
import CampoMoeda from "./CampoMoeda";
import { useFavoritos } from "@/lib/favoritos";
import { useConta } from "@/lib/conta";
import { useRouter } from "next/navigation";

const LIMITE_VISITANTE = 30;

type Ordem = "score" | "margem" | "desagio" | "lance" | "data";
const ORDENS: [Ordem, string][] = [["score", "Melhor score"], ["margem", "Maior margem"], ["desagio", "Maior deságio"], ["lance", "Menor lance"], ["data", "Leilão mais próximo"]];
const TIPOS = ["apartamento", "casa", "terreno", "comercial", "rural", "outro"];

const S = { width: 17, height: 17, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const Lupa = () => <svg {...S}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.6-3.6" /></svg>;
const Xis = ({ s = 15 }: { s?: number }) => <svg {...S} width={s} height={s}><path d="M6 6l12 12M18 6L6 18" /></svg>;
const Ajustes = () => <svg {...S}><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>;
const Seta = () => <svg {...S} width={13} height={13}><path d="M6 9l6 6 6-6" /></svg>;

export default function Lista({ imoveis }: { imoveis: Imovel[] }) {
  const { ativo, lista: padroes, ativar, desativar, pronto } = usePadroes();
  const { user, pronto: contaPronta } = useConta(); const router = useRouter();
  const visitante = contaPronta && !user;
  // Sem padrão não há pontuação: a lista mostra o catálogo cru até o usuário criar as regras dele.
  const regras = ativo ?? null;
  const [busca, setBusca] = useState(""); const [cidade, setCidade] = useState(""); const [tipo, setTipo] = useState(""); const [fonte, setFonte] = useState(""); const [modalidade, setModalidade] = useState("");
  const [soPassam, setSoPassam] = useState(true); const [ocultarVeto, setOcultarVeto] = useState(true); const [soFoto, setSoFoto] = useState(false); const [soFavs, setSoFavs] = useState(false);
  const [precoMin, setPrecoMin] = useState(0); const [precoMax, setPrecoMax] = useState(0);
  const [ocultarEncerrados, setOcultarEncerrados] = useState(true); const [soComData, setSoComData] = useState(false); const [ocultarSuspeitos, setOcultarSuspeitos] = useState(true);
  const hoje = new Date().toISOString().slice(0, 10);
  const [quartosMin, setQuartosMin] = useState(0); const [areaMin, setAreaMin] = useState(0); const [areaMax, setAreaMax] = useState(0);
  const perfil = { quartosMin, areaMin, areaMax }; const temPerfil = quartosMin > 0 || areaMin > 0 || areaMax > 0;
  const [ordem, setOrdem] = useState<Ordem>("score"); const [limite, setLimite] = useState(48); const [painel, setPainel] = useState(false);
  const { favs, toggle: toggleFav } = useFavoritos();
  const toggle = (id: string) => { if (visitante) { router.push(`/entrar?next=${encodeURIComponent("/app/buscar")}`); return; } toggleFav(id); };

  const avaliados = useMemo(() => imoveis.map((i) => ({ i, a: regras ? avaliarPadrao(i, regras) : null as Avaliacao | null })), [imoveis, regras]);
  const cidades = useMemo(() => Array.from(new Set(imoveis.map((i) => i.cidade))).sort((a, b) => a.localeCompare(b, "pt-BR")), [imoveis]);
  const fontes = useMemo(() => Array.from(new Set(imoveis.map((i) => i.fonte))).sort(), [imoveis]);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const l = avaliados.filter(({ i, a }) =>
      (!cidade || i.cidade === cidade) && (!tipo || i.tipo === tipo) && (!fonte || i.fonte === fonte) && (!modalidade || i.modalidade === modalidade) &&
      (precoMin <= 0 || i.lance_minimo >= precoMin) && (precoMax <= 0 || i.lance_minimo <= precoMax) && (!temPerfil || noPerfil(i, perfil)) &&
      (!ocultarVeto || !(i.direitos_fiduciante || i.fracao_ideal)) && (!soFoto || Boolean(i.fotos?.length || i.foto)) && (!soFavs || favs.has(i.id)) &&
      (!ocultarEncerrados || !i.data_leilao || i.data_leilao >= hoje) && (!soComData || Boolean(i.data_leilao)) && (!ocultarSuspeitos || !(i.valor_suspeito || i.desagio_pct >= 0.85)) &&
      (!soPassam || !a || a.passa) &&
      (!q || `${i.titulo} ${i.endereco ?? ""} ${i.bairro ?? ""} ${i.cidade} ${i.uf} ${i.matricula ?? ""}`.toLowerCase().includes(q)));
    const k: Record<Ordem, (x: (typeof l)[number]) => number | string> = { score: (x) => (x.a ? -x.a.score : -x.i.desagio_pct), margem: (x) => (x.a ? -x.a.res.margem : -x.i.desagio_pct), desagio: (x) => -x.i.desagio_pct, lance: (x) => x.i.lance_minimo, data: (x) => x.i.data_leilao ?? "9999" };
    return l.sort((x, y) => { const a = k[ordem](x), b = k[ordem](y); return a < b ? -1 : a > b ? 1 : 0; });
  }, [avaliados, cidade, tipo, fonte, modalidade, busca, soPassam, ocultarVeto, soFoto, soFavs, favs, ordem, precoMin, precoMax, quartosMin, areaMin, areaMax, ocultarEncerrados, soComData, ocultarSuspeitos, hoje]);

  const pills = [
    soPassam && ativo && { k: "padrao", txt: `Padrão: ${ativo.nome}`, off: () => setSoPassam(false), destaque: true },
    (precoMin > 0 || precoMax > 0) && { k: "preco", txt: precoMin > 0 && precoMax > 0 ? `Lance ${brl(precoMin)} a ${brl(precoMax)}` : precoMin > 0 ? `Lance a partir de ${brl(precoMin)}` : `Lance até ${brl(precoMax)}`, off: () => { setPrecoMin(0); setPrecoMax(0); } },
    quartosMin > 0 && { k: "quartos", txt: `${quartosMin}+ quartos`, off: () => setQuartosMin(0) },
    (areaMin > 0 || areaMax > 0) && { k: "area", txt: areaMin > 0 && areaMax > 0 ? `${areaMin} a ${areaMax} m²` : areaMin > 0 ? `A partir de ${areaMin} m²` : `Até ${areaMax} m²`, off: () => { setAreaMin(0); setAreaMax(0); } },
    cidade && { k: "cidade", txt: cidade, off: () => setCidade("") },
    tipo && { k: "tipo", txt: tipo, off: () => setTipo("") },
    modalidade && { k: "mod", txt: MODALIDADE_LABEL[modalidade], off: () => setModalidade("") },
    fonte && { k: "fonte", txt: FONTE_LABEL[fonte] ?? fonte, off: () => setFonte("") },
    soFoto && { k: "foto", txt: "Com foto", off: () => setSoFoto(false) },
    soFavs && { k: "favs", txt: "Favoritos", off: () => setSoFavs(false) },
    !ocultarVeto && { k: "veto", txt: "Mostrando vetados", off: () => setOcultarVeto(true) },
    !ocultarEncerrados && { k: "enc", txt: "Mostrando encerrados", off: () => setOcultarEncerrados(true) },
    soComData && { k: "data", txt: "Só com data", off: () => setSoComData(false) },
    !ocultarSuspeitos && { k: "susp", txt: "Mostrando valor a conferir", off: () => setOcultarSuspeitos(true) },
    busca && { k: "busca", txt: `"${busca}"`, off: () => setBusca("") },
  ].filter(Boolean) as { k: string; txt: string; off: () => void; destaque?: boolean }[];
  const nFiltros = pills.filter((p) => p.k !== "padrao" && p.k !== "busca").length;
  useEffect(() => { document.body.classList.toggle("travado", painel); return () => document.body.classList.remove("travado"); }, [painel]);
  const limpar = () => { setPrecoMin(0); setPrecoMax(0); setQuartosMin(0); setAreaMin(0); setAreaMax(0); setCidade(""); setTipo(""); setFonte(""); setModalidade(""); setBusca(""); setSoFoto(false); setSoFavs(false); setOcultarVeto(true); setSoPassam(true); setOcultarEncerrados(true); setSoComData(false); setOcultarSuspeitos(true); };

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
                {!visitante && <div className="fgrupo">
                  <h4>Meu padrão</h4>
                  {ativo ? <label className="toggle"><input type="checkbox" checked={soPassam} onChange={(e) => setSoPassam(e.target.checked)} />Mostrar só o que passa no padrão "{ativo.nome}"</label>
                    : <p style={{ margin: 0, fontSize: 13, color: "var(--mute)" }}>Nenhum padrão ativo. Sem ele a lista não é pontuada.</p>}
                  {padroes.length > 0 && <select className="fseletor" style={{ marginTop: 8 }} value={ativo?.id ?? ""} onChange={(e) => (e.target.value ? ativar(e.target.value) : desativar())} aria-label="Padrão ativo"><option value="">Sem padrão</option>{padroes.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select>}
                  <p style={{ margin: "10px 0 0", fontSize: 13 }}><Link href={ativo ? "/app/padrao" : "/app/padrao?novo=1"} style={{ color: "var(--accent-ink)", fontWeight: 600 }}>{ativo ? "Ajustar minhas regras →" : "Criar meu padrão →"}</Link></p>
                </div>}

                <div className="fgrupo">
                  <h4>Onde</h4>
                  <select className="fseletor" value={cidade} onChange={(e) => setCidade(e.target.value)} aria-label="Cidade"><option value="">Todas as cidades ({cidades.length})</option>{cidades.map((c) => <option key={c}>{c}</option>)}</select>
                  <p style={{ margin: "8px 0 0", fontSize: 12.5, color: "var(--mute)" }}>Os estados você escolhe no botão do topo da página.</p>
                </div>

                <div className="fgrupo">
                  <h4>O imóvel</h4>
                  <div className="fopcoes"><button className={`fopcao ${!tipo ? "on" : ""}`} onClick={() => setTipo("")}>Todos</button>{TIPOS.map((t) => <button key={t} className={`fopcao ${tipo === t ? "on" : ""}`} onClick={() => setTipo(tipo === t ? "" : t)}>{t}</button>)}</div>
                  <div className="fopcoes" style={{ marginTop: 10 }}>
                    <button className={`fopcao ${!quartosMin ? "on" : ""}`} onClick={() => setQuartosMin(0)}>Qualquer nº de quartos</button>
                    {[1, 2, 3, 4].map((n) => <button key={n} className={`fopcao ${quartosMin === n ? "on" : ""}`} onClick={() => setQuartosMin(quartosMin === n ? 0 : n)}>{n}+ quartos</button>)}
                  </div>
                  <div className="fopcoes" style={{ marginTop: 10 }}>
                    {([[0, 50, "até 50 m²"], [50, 80, "50 a 80 m²"], [80, 120, "80 a 120 m²"], [120, 0, "acima de 120 m²"]] as const).map(([a, b2, l]) => (
                      <button key={l} className={`fopcao ${areaMin === a && areaMax === b2 ? "on" : ""}`} onClick={() => { const on = areaMin === a && areaMax === b2; setAreaMin(on ? 0 : a); setAreaMax(on ? 0 : b2); }}>{l}</button>))}
                  </div>
                  <div className="par" style={{ marginTop: 10 }}>
                    <label className="campo"><span>Área de (m²)</span><input className="num" inputMode="numeric" value={areaMin || ""} placeholder="0" onChange={(e) => setAreaMin(Number(e.target.value.replace(/\D/g, "")) || 0)} /></label>
                    <label className="campo"><span>Área até (m²)</span><input className="num" inputMode="numeric" value={areaMax || ""} placeholder="sem teto" onChange={(e) => setAreaMax(Number(e.target.value.replace(/\D/g, "")) || 0)} /></label>
                  </div>
                  <p style={{ margin: "8px 0 0", fontSize: 12.5, color: "var(--mute)" }}>Quartos e área como a fonte informou. Lote sem o dado fica de fora quando você exige.</p>
                </div>

                <div className="fgrupo">
                  <h4>O leilão</h4>
                  <p style={{ margin: "0 0 6px", fontSize: 12, color: "var(--mute)", letterSpacing: ".04em", textTransform: "uppercase", fontWeight: 600 }}>Lance mínimo</p>
                  <div className="par">
                    <div className="campo"><span>De (0 = sem mínimo)</span><CampoMoeda valor={precoMin} onChange={setPrecoMin} /></div>
                    <div className="campo"><span>Até (0 = sem teto)</span><CampoMoeda valor={precoMax} onChange={setPrecoMax} /></div>
                  </div>
                  <div className="fopcoes" style={{ marginTop: 10 }}>
                    {([[0, 150000, "até 150 mil"], [150000, 300000, "150 a 300 mil"], [300000, 600000, "300 a 600 mil"], [600000, 0, "acima de 600 mil"]] as const).map(([a, b2, l]) => (
                      <button key={l} className={`fopcao ${precoMin === a && precoMax === b2 ? "on" : ""}`} onClick={() => { setPrecoMin(precoMin === a && precoMax === b2 ? 0 : a); setPrecoMax(precoMin === a && precoMax === b2 ? 0 : b2); }}>{l}</button>))}
                  </div>
                  <p style={{ margin: "14px 0 6px", fontSize: 12, color: "var(--mute)", letterSpacing: ".04em", textTransform: "uppercase", fontWeight: 600 }}>Modalidade</p>
                  <div className="fopcoes"><button className={`fopcao ${!modalidade ? "on" : ""}`} onClick={() => setModalidade("")}>Todas</button>{Object.entries(MODALIDADE_LABEL).map(([k, v]) => <button key={k} className={`fopcao ${modalidade === k ? "on" : ""}`} onClick={() => setModalidade(modalidade === k ? "" : k)}>{v}</button>)}</div>
                  <p style={{ margin: "8px 0 0", fontSize: 12.5, color: "var(--mute)" }}>Na Caixa: Venda Direta = Compra Direta (Venda Direta Online), Leilão SFI = Edital Único. Nas duas primeiras não há comissão de leiloeiro.</p>
                  <p style={{ margin: "14px 0 6px", fontSize: 12, color: "var(--mute)", letterSpacing: ".04em", textTransform: "uppercase", fontWeight: 600 }}>Fonte</p>
                  <div className="fopcoes"><button className={`fopcao ${!fonte ? "on" : ""}`} onClick={() => setFonte("")}>Todas</button>{fontes.map((f) => <button key={f} className={`fopcao ${fonte === f ? "on" : ""}`} onClick={() => setFonte(fonte === f ? "" : f)}>{FONTE_LABEL[f] ?? f}</button>)}</div>
                  <p style={{ margin: "14px 0 6px", fontSize: 12, color: "var(--mute)", letterSpacing: ".04em", textTransform: "uppercase", fontWeight: 600 }}>Situação</p>
                  <label className="toggle"><input type="checkbox" checked={ocultarEncerrados} onChange={(e) => setOcultarEncerrados(e.target.checked)} />Ocultar leilões já encerrados</label>
                  <label className="toggle"><input type="checkbox" checked={soComData} onChange={(e) => setSoComData(e.target.checked)} />Só lotes com data de leilão informada</label>
                </div>

                <div className="fgrupo">
                  <h4>Exibição</h4>
                  <label className="toggle"><input type="checkbox" checked={soFoto} onChange={(e) => setSoFoto(e.target.checked)} />Só lotes com foto</label>
                  <label className="toggle"><input type="checkbox" checked={soFavs} onChange={(e) => setSoFavs(e.target.checked)} />Só meus favoritos{favs.size ? ` (${favs.size})` : ""}</label>
                  <label className="toggle"><input type="checkbox" checked={!ocultarVeto} onChange={(e) => setOcultarVeto(!e.target.checked)} />Mostrar lotes vetados</label>
                  <label className="toggle"><input type="checkbox" checked={!ocultarSuspeitos} onChange={(e) => setOcultarSuspeitos(!e.target.checked)} />Mostrar lotes com valor a conferir (deságio acima de 85%)</label>
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

      {visitante && (
        <div className="sinal info" style={{ margin: "0 0 16px" }}>Você está vendo uma amostra de {LIMITE_VISITANTE} lotes. <Link href="/entrar?modo=criar&next=/app/buscar" style={{ fontWeight: 600, textDecoration: "underline" }}>Crie sua conta grátis</Link> para ver os {imoveis.length.toLocaleString("pt-BR")} lotes, definir o seu padrão e guardar favoritos.</div>)}
      {!visitante && pronto && contaPronta && !ativo && (
        <div className="sinal info" style={{ margin: "0 0 16px" }}>Você ainda não definiu o seu padrão, então a lista aparece sem pontuação. <Link href="/app/padrao?novo=1" style={{ fontWeight: 600, textDecoration: "underline" }}>Criar meu padrão</Link> leva 2 minutos.</div>)}

      <div className="contagem">
        <div><b>{(visitante ? Math.min(lista.length, LIMITE_VISITANTE) : lista.length).toLocaleString("pt-BR")}</b> <span>{soPassam && ativo ? `lotes no padrão ${ativo.nome}` : "lotes"}</span></div>
        <span style={{ color: "var(--mute)", fontSize: 13 }} title="Encerrados, vetados e lotes com valor a conferir ficam ocultos por padrão. Mude em Filtros.">{imoveis.length.toLocaleString("pt-BR")} carregados{imoveis.length - lista.length > 0 ? ` · ${(imoveis.length - lista.length).toLocaleString("pt-BR")} fora pelos filtros` : ""}</span>
      </div>

      {lista.length === 0 ? (
        <div className="vazio"><b>Nada encontrado</b>{soFavs ? "Você ainda não marcou favoritos. Toque na estrela de um lote para guardar aqui." : "Afrouxe o seu padrão (faixa, deságio, margem ou região) ou remova algum filtro."}</div>
      ) : (<>
        <div className="grade">{lista.slice(0, visitante ? LIMITE_VISITANTE : limite).map(({ i, a }) => <Card key={i.id} i={i} a={a} fav={favs.has(i.id)} toggle={toggle} />)}</div>
        {visitante && lista.length > LIMITE_VISITANTE && <div className="vazio" style={{ marginTop: 20 }}><b>Mais {(lista.length - LIMITE_VISITANTE).toLocaleString("pt-BR")} lotes esperando</b>Crie sua conta grátis para ver tudo, com o seu padrão e a sua conta de lance.<p style={{ margin: "14px 0 0" }}><Link href="/entrar?modo=criar&next=/app/buscar" className="btn ouro">Criar conta grátis</Link></p></div>}
        {!visitante && lista.length > limite && <p style={{ textAlign: "center", margin: 28 }}><button className="btn sec" onClick={() => setLimite(limite + 48)}>Mostrar mais {Math.min(48, lista.length - limite)} de {(lista.length - limite).toLocaleString("pt-BR")}</button></p>}
      </>)}
    </>
  );
}
