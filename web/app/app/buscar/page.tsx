import Lista from "@/components/Lista";
import { IMOVEIS } from "@/lib/data";
export const dynamic = "force-static";
export const metadata = { title: "Buscar" };
export default function Buscar() { return <><div className="app-cab"><div><h1>Buscar</h1><p>Todos os lotes coletados, recalculados com os seus custos. Filtre pelo seu padrão.</p></div></div><Lista imoveis={IMOVEIS} /></>; }
