import { IMOVEIS } from "@/lib/data";
import { avaliar, CRITERIOS_PADRAO } from "@/lib/motor";
import Destaques from "@/components/Destaques";
export const dynamic = "force-static";
export const metadata = { title: "Sugeridos" };
export default function Sugeridos() {
  const go = IMOVEIS.map((i) => ({ i, a: avaliar(i, CRITERIOS_PADRAO) })).filter((x) => x.a.classe === "go").sort((x, y) => y.a.score - x.a.score);
  return (<>
    <div className="app-cab"><div><h1>Sugeridos</h1><p>{go.length} lotes passam no padrão hoje pelo seu padrão. Ordenados por score.</p></div></div>
    <Destaques itens={go.slice(0, 36)} />
  </>);
}
