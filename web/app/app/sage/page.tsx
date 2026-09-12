import Sage from "@/components/Sage";
import Portao from "@/components/Portao";
import { porId } from "@/lib/catalogo";
import { tituloLimpo } from "@/lib/util";
import { tServer } from "@/lib/i18n/server";
export async function generateMetadata() {
  const t = await tServer();
  return { title: t("Sage") };
}
export default async function SagePage({ searchParams }: { searchParams: Promise<{ lote?: string }> }) {
  const { lote } = await searchParams;
  const t = await tServer();
  const aberto = lote ? await porId(decodeURIComponent(lote)) : null;
  const loteNome = aberto ? `${tituloLimpo(aberto)}, ${aberto.cidade}/${aberto.uf}` : undefined;
  return (<Portao titulo={t("Sage")}><div className="app-cab"><div><h1>{t("Sage")}</h1><p>{t("A inteligência da Lotwise. Conhece a coleta inteira, o seu padrão e a conta de cada lote.")}</p></div></div><Sage loteId={lote} loteNome={loteNome} /></Portao>);
}
