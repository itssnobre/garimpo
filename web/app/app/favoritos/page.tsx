"use client";
import { useLotes } from "@/lib/indice";
import { avaliar } from "@/lib/motor";
import { useFavoritos } from "@/lib/favoritos";
import Card from "@/components/Card";
import Link from "next/link";
export default function Favoritos() {
  const { favs, toggle } = useFavoritos();
  const { imoveis: IMOVEIS } = useLotes([...favs]);
  const itens = IMOVEIS.filter((i) => favs.has(i.id));
  return (<>
    <div className="app-cab"><div><h1>Favoritos</h1><p>{itens.length} lotes guardados neste navegador.</p></div></div>
    {itens.length === 0 ? <div className="vazio"><b>Nenhum favorito ainda</b>Toque na estrela de um lote em <Link href="/app/buscar" style={{ textDecoration: "underline" }}>Buscar</Link> ou <Link href="/app/sugeridos" style={{ textDecoration: "underline" }}>Sugeridos</Link>.</div>
      : <div className="grade">{itens.map((i) => <Card key={i.id} i={i} a={avaliar(i)} fav toggle={toggle} />)}</div>}
  </>);
}
