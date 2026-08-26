import Lista from "@/components/Lista";
import { IMOVEIS } from "@/lib/data";
export const dynamic = "force-static";
export const metadata = { title: "Imóveis em leilão em SP" };
export default function Imoveis() { return <Lista imoveis={IMOVEIS} />; }
