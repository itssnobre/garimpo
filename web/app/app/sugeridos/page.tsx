import { IMOVEIS } from "@/lib/data";
import { avaliar, CRITERIOS_PADRAO } from "@/lib/motor";
import Destaques from "@/components/Destaques";
export const dynamic = "force-static";
export const metadata = { title: "Sugeridos" };
export default function Sugeridos() {
  const go = IMOVEIS.map((i) => ({ i, a: avaliar(i, CRITERIOS_PADRAO) })).filter((x) => x.a.classe === "go").sort((x, y) => y.a.score - x.a.score);
  const regiao = go.filter((x) => x.a.regiao !== "Outra");
  return (<>
    <div className="app-cab"><div><h1>Sugeridos</h1><p>{go.length} lotes passam no padrão hoje (faixa alvo, deságio 40%+, margem líquida 25%+). Ordenados por score.</p></div></div>
    {regiao.length > 0 && <><h2 className="display" style={{ fontSize: 18, margin: "6px 0 12px" }}>Sorocaba e ABC <span className="mono" style={{ fontSize: 12, color: "var(--musgo)", fontWeight: 400 }}>{regiao.length}</span></h2><Destaques itens={regiao.slice(0, 12)} /></>}
    <h2 className="display" style={{ fontSize: 18, margin: "26px 0 12px" }}>Resto de SP <span className="mono" style={{ fontSize: 12, color: "var(--musgo)", fontWeight: 400 }}>{go.length - regiao.length}</span></h2>
    <Destaques itens={go.filter((x) => x.a.regiao === "Outra").slice(0, 24)} />
  </>);
}
