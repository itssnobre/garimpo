"use client";
import { useLotes } from "@/lib/indice";
import { avaliarPadrao } from "@/lib/motor";
import { usePadroes } from "@/lib/usePadroes";
import Portao from "@/components/Portao";
import { useFavoritos } from "@/lib/favoritos";
import { useConta } from "@/lib/conta";
import Card from "@/components/Card";
import Link from "next/link";
function Conteudo() {
  const { favs, toggle } = useFavoritos(); const { user } = useConta(); const { ativo } = usePadroes();
  const { imoveis: IMOVEIS } = useLotes([...favs]);
  const itens = IMOVEIS.filter((i) => favs.has(i.id));
  return (<>
    <div className="app-cab"><div><h1>Favoritos</h1><p>{itens.length} lotes guardados{user ? " na sua conta" : " neste navegador"}.</p></div></div>
    {itens.length === 0 ? <div className="vazio"><b>Nenhum favorito ainda</b>Toque na estrela de um lote em <Link href="/app/buscar" style={{ textDecoration: "underline" }}>Buscar</Link> ou <Link href="/app/sugeridos" style={{ textDecoration: "underline" }}>Sugeridos</Link>.</div>
      : <div className="grade">{itens.map((i) => <Card key={i.id} i={i} a={ativo ? avaliarPadrao(i, ativo) : null} fav toggle={toggle} />)}</div>}
  </>);
}
export default function Favoritos() { return <Portao titulo="Favoritos"><Conteudo /></Portao>; }
