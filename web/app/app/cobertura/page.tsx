import { IMOVEIS, META } from "@/lib/data";
import { FONTE_LABEL, REGIAO_ABC, REGIAO_SOROCABA, regiaoDe } from "@/lib/motor";
export const metadata = { title: "Cobertura" };
export default function Cobertura() {
  const porFonte = Object.entries(META.fontes).map(([f, s]) => ({ f, ...s, ativos: IMOVEIS.filter((i) => i.fonte === f).length })).sort((a, b) => b.ativos - a.ativos);
  const max = Math.max(...porFonte.map((x) => x.ativos));
  const cidades = new Map<string, number>(); IMOVEIS.forEach((i) => cidades.set(i.cidade, (cidades.get(i.cidade) ?? 0) + 1));
  const top = [...cidades.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
  const reg = IMOVEIS.filter((i) => regiaoDe(i.cidade) !== "Outra").length;
  return (<>
    <div className="app-cab"><div><h1>Cobertura</h1><p>{IMOVEIS.length.toLocaleString("pt-BR")} lotes ativos em {cidades.size} cidades. Última coleta em {new Date(META.gerado_em).toLocaleDateString("pt-BR", { day: "2-digit", month: "long" })}.</p></div></div>
    <div className="stats"><div className="stat"><b>{porFonte.length}</b><span>fontes ativas</span></div><div className="stat"><b>{cidades.size}</b><span>cidades</span></div><div className="stat"><b>{reg}</b><span>Sorocaba + ABC</span></div><div className="stat"><b>{IMOVEIS.filter((i) => i.matricula).length}</b><span>com matrícula</span></div></div>
    <div className="doisdois">
      <div className="painel"><h2>Fontes</h2>{porFonte.map((x) => <div key={x.f} style={{ marginBottom: 10 }}><div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5 }}><span>{FONTE_LABEL[x.f] ?? x.f}</span><b className="mono">{x.ativos}</b></div><div className="barra-h"><i style={{ width: (x.ativos / max) * 100 + "%" }} /></div></div>)}</div>
      <div className="painel"><h2>Cidades com mais lotes</h2><table className="tabela"><tbody>{top.map(([c, n]) => <tr key={c}><td>{c}{REGIAO_SOROCABA.includes(c) || REGIAO_ABC.includes(c) ? <span className="regiao-tag">{regiaoDe(c)}</span> : null}</td><td className="num">{n}</td></tr>)}</tbody></table></div>
    </div>
  </>);
}
