import { IMOVEIS, META } from "@/lib/data";
import { FONTE_LABEL } from "@/lib/motor";
import { UFS_NOMES } from "@/lib/meta";
export const metadata = { title: "Cobertura" };
export default function Cobertura() {
  const porFonte = Object.entries(META.fontes).map(([f, s]) => ({ f, ...s, ativos: IMOVEIS.filter((i) => i.fonte === f).length })).sort((a, b) => b.ativos - a.ativos);
  const max = Math.max(...porFonte.map((x) => x.ativos));
  const cidades = new Map<string, number>(); IMOVEIS.forEach((i) => cidades.set(i.cidade, (cidades.get(i.cidade) ?? 0) + 1));
  const top = [...cidades.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
  const ufs = Object.entries(META.por_uf ?? {}).sort((a, b) => b[1] - a[1]); const maxUf = Math.max(1, ...ufs.map((x) => x[1]));
  return (<>
    <div className="app-cab"><div><h1>Cobertura</h1><p>{IMOVEIS.length.toLocaleString("pt-BR")} lotes ativos em {cidades.size} cidades. Última coleta em {new Date(META.gerado_em).toLocaleDateString("pt-BR", { day: "2-digit", month: "long" })}.</p></div></div>
    <div className="stats"><div className="stat"><b>{porFonte.length}</b><span>fontes ativas</span></div><div className="stat"><b>{cidades.size}</b><span>cidades</span></div><div className="stat"><b>{ufs.length}</b><span>estados</span></div><div className="stat"><b>{IMOVEIS.filter((i) => i.matricula).length}</b><span>com matrícula</span></div></div>
    <div className="doisdois">
      <div className="painel"><h2>Fontes</h2>{porFonte.map((x) => <div key={x.f} style={{ marginBottom: 10 }}><div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5 }}><span>{FONTE_LABEL[x.f] ?? x.f}</span><b className="mono">{x.ativos}</b></div><div className="barra-h"><i style={{ width: (x.ativos / max) * 100 + "%" }} /></div></div>)}</div>
      <div className="painel"><h2>Cidades com mais lotes</h2><table className="tabela"><tbody>{top.map(([c, n]) => <tr key={c}><td>{c}</td><td className="num">{n}</td></tr>)}</tbody></table></div>
    </div>
    <div className="painel" style={{ marginTop: 16 }}><h2>Lotes por estado</h2><div className="uf-grade">{ufs.map(([u, n]) => <div key={u} className="uf-linha"><span title={UFS_NOMES[u]}>{u}</span><div className="barra-h"><i style={{ width: (n / maxUf) * 100 + "%" }} /></div><b className="num">{n.toLocaleString("pt-BR")}</b></div>)}</div></div>
  </>);
}
