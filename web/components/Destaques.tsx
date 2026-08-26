"use client";
import type { Imovel } from "@/lib/types";
import type { Avaliacao } from "@/lib/motor";
import { useFavoritos } from "@/lib/favoritos";
import Card from "./Card";
export default function Destaques({ itens }: { itens: { i: Imovel; a: Avaliacao }[] }) {
  const { favs, toggle } = useFavoritos();
  return <div className="grade compacta">{itens.map(({ i, a }) => <Card key={i.id} i={i} a={a} fav={favs.has(i.id)} toggle={toggle} />)}</div>;
}
