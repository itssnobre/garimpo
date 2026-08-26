import Lista from "@/components/Lista";
import { IMOVEIS } from "@/lib/data";
import { avaliar, CRITERIOS_PADRAO } from "@/lib/motor";
export const dynamic = "force-static";
export default function Home() {
  const av = IMOVEIS.map((i) => avaliar(i, CRITERIOS_PADRAO));
  const go = av.filter((a) => a.classe === "go").length;
  const regiao = av.filter((a) => a.regiao !== "Outra").length;
  const vetados = IMOVEIS.filter((i) => i.direitos_fiduciante || i.fracao_ideal).length;
  return (
    <>
      <section className="hero">
        <div>
          <h1>Só o que paga <em>a margem</em>.</h1>
          <p>Todo lote de leilão em SP, recalculado com leiloeiro, ITBI, registro, carrego e imposto. O que sobra é a margem líquida real e o lance máximo que ainda a respeita.</p>
        </div>
        <div className="regra">
          <div><b>{IMOVEIS.length.toLocaleString("pt-BR")}</b><span>lotes coletados</span></div>
          <div><b style={{ color: "var(--go)" }}>{go}</b><span>GO no padrão</span></div>
          <div><b>{regiao}</b><span>Sorocaba + ABC</span></div>
          <div><b style={{ color: "var(--stop)" }}>{vetados}</b><span>vetados</span></div>
        </div>
      </section>
      <Lista imoveis={IMOVEIS} />
    </>
  );
}
