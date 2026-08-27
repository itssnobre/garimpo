"use client";
import Link from "next/link";
import { IMOVEIS } from "@/lib/data";
import { avaliar, brl, pct, calcular, custosPara } from "@/lib/motor";
import { usePipeline } from "@/lib/pipeline";
export default function Carteira() {
  const { pipe, mover } = usePipeline();
  const itens = IMOVEIS.filter((i) => pipe[i.id]?.etapa === "Arrematado");
  const linhas = itens.map((i) => { const lance = pipe[i.id].lanceFinal ?? i.lance_minimo; const r = calcular(i.avaliacao, lance, custosPara(i)); return { i, lance, r }; });
  const cap = linhas.reduce((s, x) => s + x.r.total, 0), lucro = linhas.reduce((s, x) => s + x.r.lucro, 0);
  return (<>
    <div className="app-cab"><div><h1>Carteira</h1><p>Lotes marcados como arrematados no pipeline. Edite o lance final pra ver o resultado real.</p></div></div>
    <div className="stats"><div className="stat"><b>{itens.length}</b><span>imóveis</span></div><div className="stat"><b>{brl(cap)}</b><span>capital empregado</span></div><div className="stat"><b style={{ color: lucro >= 0 ? "var(--go)" : "var(--stop)" }}>{brl(lucro)}</b><span>lucro líquido estimado</span></div><div className="stat"><b>{cap > 0 ? pct(lucro / cap) : "—"}</b><span>margem média</span></div></div>
    {itens.length === 0 ? <div className="vazio"><b>Nada arrematado ainda</b>Quando arrematar, mova o lote pra "Arrematado" no <Link href="/app/pipeline" style={{ textDecoration: "underline" }}>Pipeline</Link>.</div> : (
      <div className="painel" style={{ overflowX: "auto" }}><table className="tabela"><thead><tr><th>Imóvel</th><th className="num">Avaliação</th><th className="num">Lance final</th><th className="num">Capital</th><th className="num">Lucro líq.</th><th className="num">Margem</th></tr></thead>
        <tbody>{linhas.map(({ i, lance, r }) => <tr key={i.id}><td><Link href={`/app/imovel/${encodeURIComponent(i.id)}`} style={{ fontWeight: 600 }}>{i.titulo}</Link><br /><span className="sub">{i.cidade} · score {avaliar(i).score}</span></td><td className="num">{brl(i.avaliacao)}</td>
          <td className="num"><input className="mono" type="number" value={lance} onChange={(e) => mover(i.id, "Arrematado", { lanceFinal: +e.target.value || 0 })} style={{ width: 130, textAlign: "right", font: "13px var(--f-mono)", padding: "4px 6px", border: "1px solid var(--veio)", borderRadius: 6, background: "var(--papel2)", color: "var(--tinta)" }} /></td>
          <td className="num">{brl(r.total)}</td><td className="num" style={{ color: r.lucro >= 0 ? "var(--go)" : "var(--stop)" }}>{brl(r.lucro)}</td><td className="num">{pct(r.margem)}</td></tr>)}</tbody></table></div>)}
  </>);
}
