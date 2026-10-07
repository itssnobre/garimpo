import Link from "next/link";
import { predios } from "@/lib/catalogo";
import { UFS_NOMES } from "@/lib/meta";
import { getLang, tServer } from "@/lib/i18n/server";
import { brlCurto, pct, setFmtLang } from "@/lib/fmt";
import { enderecoDoPredio } from "@/lib/util";
export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await tServer();
  return { title: t("Condomínios com vários apartamentos em leilão") };
}

export default async function Condominios({ searchParams }: { searchParams: Promise<{ uf?: string }> }) {
  const { uf: ufBruta } = await searchParams;
  const uf = ufBruta && UFS_NOMES[ufBruta.toUpperCase()] ? ufBruta.toUpperCase() : undefined;
  setFmtLang(await getLang());
  const t = await tServer();
  const lista = await predios({ uf, limite: 90 });
  return (<>
    <div className="app-cab"><div>
      <h1>{t("Condomínios")}</h1>
      <p>{t("Prédios com dois ou mais apartamentos em leilão ao mesmo tempo. Dentro de cada um, as unidades aparecem lado a lado por andar, para comparar o preço entre vizinhos.")}</p>
    </div></div>

    <form className="condo-filtro" method="get">
      <label><span>{t("Estado")}</span>
        <select name="uf" defaultValue={uf ?? ""}>
          <option value="">{t("Brasil inteiro")}</option>
          {Object.entries(UFS_NOMES).map(([sigla, nome]) => <option key={sigla} value={sigla}>{nome}</option>)}
        </select>
      </label>
      <button className="btn sec mini" type="submit">{t("Filtrar")}</button>
    </form>

    {lista.length === 0 ? <div className="vazio"><b>{t("Nenhum condomínio por aqui")}</b>{t("Não há prédio com duas ou mais unidades em leilão aberto neste filtro.")}</div> : (
      <div className="condo-lista">
        {lista.map((p) => (
          <Link key={p.predio_id} href={`/app/condominio/${p.predio_id}`} className="condo-card">
            <span className="cc-qtd"><b className="num">{p.abertas}</b>{t("apartamentos")}</span>
            <span className="cc-corpo">
              <b>{enderecoDoPredio(p.endereco) || p.cidade}</b>
              <small>{[p.bairro, `${p.cidade}/${p.uf}`].filter(Boolean).join(" · ")}</small>
              <small className="cc-fatos">
                <span className="num">{p.lance_min === p.lance_max ? brlCurto(p.lance_min) : t("{a} a {b}", { a: brlCurto(p.lance_min), b: brlCurto(p.lance_max) })}</span>
                {p.blocos > 1 && <span>{t("{n} blocos", { n: p.blocos })}</span>}
                {p.desagio_max > 0 && p.desagio_max < 0.85 && <span>{t("até {pct} de deságio", { pct: pct(p.desagio_max) })}</span>}
              </small>
            </span>
            <span className="cc-ir" aria-hidden>→</span>
          </Link>))}
      </div>)}
  </>);
}
