import Lista from "@/components/Lista";
import { IMOVEIS } from "@/lib/data";
export const dynamic = "force-static";
export const metadata = { title: "Buscar" };
export default function Buscar() { return <><div className="app-cab"><div><h1>Buscar</h1><p>{IMOVEIS.length.toLocaleString("pt-BR")} lotes em SP, todos recalculados. Filtre pelo seu padrão.</p></div></div><Lista imoveis={IMOVEIS} /></>; }
