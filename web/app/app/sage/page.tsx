import Sage from "@/components/Sage";
import Portao from "@/components/Portao";
import { byId } from "@/lib/dadosCompletos";
import { tituloLimpo } from "@/lib/util";
export const metadata = { title: "Sage" };
export default async function SagePage({ searchParams }: { searchParams: Promise<{ lote?: string }> }) {
  const { lote } = await searchParams;
  return (<Portao titulo="Sage"><div className="app-cab"><div><h1>Sage</h1><p>A inteligência da Lotwise. Conhece a coleta inteira, o seu padrão e a conta de cada lote.</p></div></div><Sage loteId={lote} loteNome={lote ? (() => { const i = byId(decodeURIComponent(lote)); return i ? `${tituloLimpo(i)}, ${i.cidade}/${i.uf}` : undefined; })() : undefined} /></Portao>);
}
