"use client";
import Link from "next/link";
import { IMOVEIS } from "@/lib/data";
import { avaliar, brl } from "@/lib/motor";
import { tituloLimpo } from "@/lib/util";
import { useFavoritos } from "@/lib/favoritos";
import { ETAPAS, usePipeline, type Etapa } from "@/lib/pipeline";
export default function Pipeline() {
  const { favs } = useFavoritos(); const { pipe, mover, tirar } = usePipeline();
  const ids = new Set([...favs, ...Object.keys(pipe)]);
  const itens = IMOVEIS.filter((i) => ids.has(i.id));
  const etapaDe = (id: string): Etapa => pipe[id]?.etapa ?? "Analisando";
  return (<>
    <div className="app-cab"><div><h1>Pipeline</h1><p>Do favorito ao arremate. Favoritos entram em "Analisando"; mova conforme avança a diligência.</p></div></div>
    {itens.length === 0 ? <div className="vazio"><b>Pipeline vazio</b>Marque favoritos em <Link href="/app/buscar" style={{ textDecoration: "underline" }}>Buscar</Link> pra eles aparecerem aqui.</div> : (
      <div className="kanban">{ETAPAS.map((et) => { const col = itens.filter((i) => etapaDe(i.id) === et); return (
        <div key={et} className="coluna"><h3>{et}<b>{col.length}</b></h3>
          {col.map((i) => { const a = avaliar(i); return (
            <div key={i.id} className="kcard">
              {(i.fotos?.[0] ?? i.foto) && <img src={i.fotos?.[0] ?? i.foto} alt="" referrerPolicy="no-referrer" />}
              <Link href={`/app/imovel/${encodeURIComponent(i.id)}`} className="t">{tituloLimpo(i)}</Link>
              <div className="s">{i.cidade} · {brl(i.lance_minimo)} · máx 30% {brl(a.res.lanceMax30)} · score {a.score}</div>
              <div className="mv">{ETAPAS.filter((e) => e !== et).map((e) => <button key={e} onClick={() => mover(i.id, e)}>→ {e}</button>)}<button onClick={() => tirar(i.id)} style={{ color: "var(--bad)" }}>tirar</button></div>
            </div>); })}
        </div>); })}</div>)}
  </>);
}
