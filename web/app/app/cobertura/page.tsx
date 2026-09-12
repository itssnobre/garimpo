import { META } from "@/lib/data";
import { FONTE_LABEL } from "@/lib/motor";
import { UFS_NOMES } from "@/lib/meta";
import { tServer } from "@/lib/i18n/server";
import { fmtLang } from "@/lib/fmt";
export async function generateMetadata() {
  const t = await tServer();
  return { title: t("Cobertura") };
}
export default async function Cobertura() {
  const t = await tServer();
  const loc = fmtLang() === "en" ? "en-US" : "pt-BR";
  const porFonte = Object.entries(META.fontes).map(([f, s]) => ({ f, ...s, ativos: META.por_fonte?.[f] ?? 0 })).sort((a, b) => b.ativos - a.ativos);
  const max = Math.max(...porFonte.map((x) => x.ativos));
  // Contagens vêm prontas da coleta: a página mostra resumo, não precisa varrer o catálogo.
  const top = Object.entries(META.por_cidade ?? {}).slice(0, 20);
  const totalCidades = META.cidades_total ?? top.length;
  const ufs = Object.entries(META.por_uf ?? {}).sort((a, b) => b[1] - a[1]); const maxUf = Math.max(1, ...ufs.map((x) => x[1]));
  return (<>
    <div className="app-cab"><div><h1>{t("Cobertura")}</h1><p>{t("{n} lotes ativos em {c} cidades. Última coleta em {d}.", { n: (META.total ?? 0).toLocaleString(loc), c: totalCidades, d: new Date(META.gerado_em).toLocaleDateString(loc, { day: "2-digit", month: "long" }) })}</p></div></div>
    <div className="stats"><div className="stat"><b>{porFonte.length}</b><span>{t("fontes ativas")}</span></div><div className="stat"><b>{totalCidades}</b><span>{t("cidades")}</span></div><div className="stat"><b>{ufs.length}</b><span>{t("estados")}</span></div><div className="stat"><b>{(META.com_matricula ?? 0).toLocaleString(loc)}</b><span>{t("com matrícula")}</span></div></div>
    <div className="doisdois">
      <div className="painel"><h2>{t("Fontes")}</h2>{porFonte.map((x) => <div key={x.f} style={{ marginBottom: 10 }}><div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5 }}><span>{FONTE_LABEL[x.f] ?? x.f}</span><b className="mono">{x.ativos}</b></div><div className="barra-h"><i style={{ width: (x.ativos / max) * 100 + "%" }} /></div></div>)}</div>
      <div className="painel"><h2>{t("Cidades com mais lotes")}</h2><table className="tabela"><tbody>{top.map(([c, n]) => <tr key={c}><td>{c}</td><td className="num">{n}</td></tr>)}</tbody></table></div>
    </div>
    <div className="painel" style={{ marginTop: 16 }}><h2>{t("Lotes por estado")}</h2><div className="uf-grade">{ufs.map(([u, n]) => <div key={u} className="uf-linha"><span title={UFS_NOMES[u]}>{u}</span><div className="barra-h"><i style={{ width: (n / maxUf) * 100 + "%" }} /></div><b className="num">{n.toLocaleString(loc)}</b></div>)}</div></div>
  </>);
}
