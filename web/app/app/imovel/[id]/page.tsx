import { notFound } from "next/navigation";
import { byId } from "@/lib/dadosCompletos";
import Lote from "@/components/Lote";
export const dynamic = "force-dynamic";
export default async function Pagina({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const i = byId(decodeURIComponent(id));
  if (!i) notFound();
  return (<div className="lote"><Lote imovel={i} /></div>);
}
