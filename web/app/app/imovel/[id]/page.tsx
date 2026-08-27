import Link from "next/link";
import { notFound } from "next/navigation";
import { byId } from "@/lib/data";
import Lote from "@/components/Lote";
export const dynamic = "force-dynamic";
export default async function Pagina({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const i = byId(decodeURIComponent(id));
  if (!i) notFound();
  return (<div className="lote"><Link href="/app/buscar" className="volta">← Voltar à busca</Link><Lote imovel={i} /></div>);
}
