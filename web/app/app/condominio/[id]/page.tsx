import { notFound } from "next/navigation";
import { porPredio } from "@/lib/catalogo";
import { tServer } from "@/lib/i18n/server";
import { enderecoDoPredio } from "@/lib/util";
import Espelho from "@/components/Espelho";
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await tServer();
  const itens = await porPredio(id);
  const ref = itens.find((i) => i.endereco) ?? itens[0];
  if (!ref) return { title: t("Condomínio") };
  const end = enderecoDoPredio(ref.endereco) || ref.cidade;
  return {
    title: t("Leilão de apartamentos em {end}, {cidade}/{uf}", { end, cidade: ref.cidade, uf: ref.uf }),
    description: t("{n} apartamentos do mesmo condomínio em leilão, lado a lado por andar, com lance, avaliação e deságio de cada unidade.", { n: itens.length }),
  };
}

export default async function Condominio({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const itens = await porPredio(id);
  if (!itens.length) notFound();
  // "Hoje" sai do servidor para o cliente não discordar na hidratação sobre o que já encerrou.
  return (<div className="lote condo"><Espelho itens={itens} hoje={new Date().toISOString().slice(0, 10)} /></div>);
}
