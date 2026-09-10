"use client";
import { useLotes } from "@/lib/indice";
import { avaliarPadrao } from "@/lib/motor";
import { usePadroes } from "@/lib/usePadroes";
import Portao from "@/components/Portao";
import { useFavoritos } from "@/lib/favoritos";
import { useConta } from "@/lib/conta";
import Card from "@/components/Card";
import Link from "next/link";
import { useT } from "@/lib/i18n/client";
function Conteudo() {
  const { t } = useT();
  const { favs, toggle } = useFavoritos(); const { user } = useConta(); const { ativo } = usePadroes();
  const { imoveis: IMOVEIS } = useLotes([...favs]);
  const itens = IMOVEIS.filter((i) => favs.has(i.id));
  return (<>
    <div className="app-cab"><div><h1>{t("Favoritos")}</h1><p>{t("{n} lotes guardados{onde}", { n: itens.length, onde: user ? t(" na sua conta") : t(" neste navegador") })}.</p></div></div>
    {itens.length === 0 ? <div className="vazio"><b>{t("Nenhum favorito ainda")}</b>{t("Toque na estrela de um lote em")} <Link href="/app/buscar" style={{ textDecoration: "underline" }}>{t("Buscar")}</Link> {t("ou")} <Link href="/app/sugeridos" style={{ textDecoration: "underline" }}>{t("Sugeridos")}</Link>.</div>
      : <div className="grade">{itens.map((i) => <Card key={i.id} i={i} a={ativo ? avaliarPadrao(i, ativo) : null} fav toggle={toggle} />)}</div>}
  </>);
}
export default function Favoritos() { const { t } = useT(); return <Portao titulo={t("Favoritos")}><Conteudo /></Portao>; }
