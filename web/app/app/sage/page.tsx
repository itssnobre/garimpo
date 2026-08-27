import Sage from "@/components/Sage";
import { byId } from "@/lib/dadosCompletos";
import { tituloLimpo } from "@/lib/util";
export const metadata = { title: "Sage" };
export default async function SagePage({ searchParams }: { searchParams: Promise<{ lote?: string }> }) {
  const { lote } = await searchParams;
  return (<><div className="app-cab"><div><h1>Sage</h1><p>A inteligência da Lotwise. Conhece a coleta inteira, o padrão do garimpo e a conta de cada lote.</p></div></div><Sage loteId={lote} loteNome={lote ? (() => { const i = byId(decodeURIComponent(lote)); return i ? `${tituloLimpo(i)}, ${i.cidade}/${i.uf}` : undefined; })() : undefined} /></>);
}
