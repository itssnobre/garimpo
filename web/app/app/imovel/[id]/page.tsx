import { notFound } from "next/navigation";
import { comPredio, outrasDoPredio, porId } from "@/lib/catalogo";
import Lote from "@/components/Lote";
export const dynamic = "force-dynamic";
export default async function Pagina({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const achado = await porId(decodeURIComponent(id));
  if (!achado) notFound();
  const i = await comPredio(achado);
  const outras = await outrasDoPredio(i);
  return (<div className="lote"><Lote imovel={i} outrasNoPredio={outras} /></div>);
}
