import Lista from "@/components/Lista";
import { IMOVEIS, META } from "@/lib/data";
export const dynamic = "force-static";
export default function Home() {
  const gerado = new Date(META.gerado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  return (
    <div className="wrap">
      <header className="top">
        <div>
          <p className="eyebrow">Garimpo</p>
          <h1>Imóveis em leilão, filtrados no nosso padrão</h1>
          <p className="lede">Faixa alvo, deságio mínimo 40%, margem líquida mínima 25% (alvo 30 a 35%) depois de todos os custos, região Sorocaba e ABC, vetos de diligência aplicados.</p>
        </div>
        <div className="meta">{META.total} imóveis em SP<br />{Object.keys(META.fontes).length} fontes · atualizado {gerado}</div>
      </header>
      <Lista imoveis={IMOVEIS} />
    </div>
  );
}
