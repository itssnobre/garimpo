import Lista from "@/components/Lista";
import { IMOVEIS } from "@/lib/data";
export const dynamic = "force-static";
export default function Home() { return <Lista imoveis={IMOVEIS} />; }
