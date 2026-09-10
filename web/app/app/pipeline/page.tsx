"use client";
import Link from "next/link";
import { useLotes } from "@/lib/indice";
import { avaliarPadrao, brl } from "@/lib/motor";
import { usePadroes } from "@/lib/usePadroes";
import Portao from "@/components/Portao";
import { tituloLimpo } from "@/lib/util";
import { useFavoritos } from "@/lib/favoritos";
import { ETAPAS, usePipeline, type Etapa } from "@/lib/pipeline";
import { useT } from "@/lib/i18n/client";
function Conteudo() {
  const { t } = useT();
  const { ativo } = usePadroes(); const { favs } = useFavoritos(); const { pipe, mover, tirar } = usePipeline();
  const ids = new Set([...favs, ...Object.keys(pipe)]);
  const { imoveis: IMOVEIS } = useLotes([...ids]);
  const itens = IMOVEIS.filter((i) => ids.has(i.id));
  const etapaDe = (id: string): Etapa => pipe[id]?.etapa ?? "Analisando";
  return (<>
    <div className="app-cab"><div><h1>{t("Pipeline")}</h1><p>{t("Do favorito ao arremate. Favoritos entram em \"{etapa}\"; mova conforme avança a diligência.", { etapa: t("Analisando") })}</p></div></div>
    {itens.length === 0 ? <div className="vazio"><b>{t("Pipeline vazio")}</b>{t("Marque favoritos em")} <Link href="/app/buscar" style={{ textDecoration: "underline" }}>{t("Buscar")}</Link> {t("pra eles aparecerem aqui.")}</div> : (
      <div className="kanban">{ETAPAS.map((et) => { const col = itens.filter((i) => etapaDe(i.id) === et); return (
        <div key={et} className="coluna"><h3>{t(et)}<b>{col.length}</b></h3>
          {col.map((i) => { const a = ativo ? avaliarPadrao(i, ativo) : null; return (
            <div key={i.id} className="kcard">
              {(i.fotos?.[0] ?? i.foto) && <img src={i.fotos?.[0] ?? i.foto} alt="" referrerPolicy="no-referrer" />}
              <Link href={`/app/imovel/${encodeURIComponent(i.id)}`} className="t">{tituloLimpo(i)}</Link>
              <div className="s">{i.cidade} · {brl(i.lance_minimo)}{a ? ` · ${t("máx 30% {v}", { v: brl(a.res.lanceMax30) })} · ${t("score {v}", { v: a.score })}` : ""}</div>
              <div className="mv">{ETAPAS.filter((e) => e !== et).map((e) => <button key={e} onClick={() => mover(i.id, e)}>→ {t(e)}</button>)}<button onClick={() => tirar(i.id)} style={{ color: "var(--bad)" }}>{t("tirar")}</button></div>
            </div>); })}
        </div>); })}</div>)}
  </>);
}
export default function Pipeline() { const { t } = useT(); return <Portao titulo={t("Pipeline")}><Conteudo /></Portao>; }
