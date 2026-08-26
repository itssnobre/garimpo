"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import type { Imovel } from "@/lib/types";
import { avaliar, brl, pct, CRITERIOS_PADRAO, FONTE_LABEL, MODALIDADE_LABEL, type Criterios } from "@/lib/motor";

type Ordem = "score" | "margem" | "desagio" | "lance" | "avaliacao" | "data";

export default function Lista({ imoveis }: { imoveis: Imovel[] }) {
  const [crit, setCrit] = useState<Criterios>(CRITERIOS_PADRAO);
  const [cidade, setCidade] = useState("");
  const [tipo, setTipo] = useState("");
  const [fonte, setFonte] = useState("");
  const [busca, setBusca] = useState("");
  const [soPassam, setSoPassam] = useState(true);
  const [ocultarVeto, setOcultarVeto] = useState(true);
  const [ordem, setOrdem] = useState<Ordem>("score");

  const avaliados = useMemo(() => imoveis.map((i) => ({ i, a: avaliar(i, crit) })), [imoveis, crit]);
  const cidades = useMemo(() => Array.from(new Set(imoveis.map((i) => i.cidade))).sort((a, b) => a.localeCompare(b, "pt-BR")), [imoveis]);
  const fontes = useMemo(() => Array.from(new Set(imoveis.map((i) => i.fonte))).sort(), [imoveis]);

  const lista = useMemo(() => {
    const q = busca.toLowerCase();
    let l = avaliados.filter(({ i, a }) =>
      (!cidade || i.cidade === cidade) && (!tipo || i.tipo === tipo) && (!fonte || i.fonte === fonte) &&
      (!crit.soRegiao || a.regiao !== "Outra") &&
      (!ocultarVeto || !(i.direitos_fiduciante || i.fracao_ideal)) &&
      (!soPassam || (i.avaliacao >= crit.faixaMin && i.avaliacao <= crit.faixaMax && i.desagio_pct >= crit.desagioMin && a.res.margem >= crit.margemMin)) &&
      (!q || `${i.titulo} ${i.endereco ?? ""} ${i.bairro ?? ""} ${i.cidade}`.toLowerCase().includes(q)));
    const k: Record<Ordem, (x: { i: Imovel; a: ReturnType<typeof avaliar> }) => number | string> = {
      score: (x) => -x.a.score, margem: (x) => -x.a.res.margem, desagio: (x) => -x.i.desagio_pct,
      lance: (x) => x.i.lance_minimo, avaliacao: (x) => x.i.avaliacao, data: (x) => x.i.data_leilao ?? "9999",
    };
    l = l.sort((x, y) => { const a = k[ordem](x), b = k[ordem](y); return a < b ? -1 : a > b ? 1 : 0; });
    return l;
  }, [avaliados, cidade, tipo, fonte, busca, soPassam, ocultarVeto, ordem, crit]);

  const go = lista.filter((x) => x.a.classe === "go").length;
  const num = (v: string) => Number(v.replace(/\D/g, "")) || 0;

  return (
    <>
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="filtros">
          <label className="f">Avaliação de<input value={crit.faixaMin} onChange={(e) => setCrit({ ...crit, faixaMin: num(e.target.value) })} /></label>
          <label className="f">Avaliação até<input value={crit.faixaMax} onChange={(e) => setCrit({ ...crit, faixaMax: num(e.target.value) })} /></label>
          <label className="f">Deságio mín. %<input value={Math.round(crit.desagioMin * 100)} onChange={(e) => setCrit({ ...crit, desagioMin: num(e.target.value) / 100 })} /></label>
          <label className="f">Margem líq. mín. %<input value={Math.round(crit.margemMin * 100)} onChange={(e) => setCrit({ ...crit, margemMin: num(e.target.value) / 100 })} /></label>
          <label className="f">Cidade<select value={cidade} onChange={(e) => setCidade(e.target.value)}><option value="">Todas</option>{cidades.map((c) => <option key={c}>{c}</option>)}</select></label>
          <label className="f">Tipo<select value={tipo} onChange={(e) => setTipo(e.target.value)}><option value="">Todos</option>{["apartamento", "casa", "terreno", "comercial", "rural", "outro"].map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
          <label className="f">Fonte<select value={fonte} onChange={(e) => setFonte(e.target.value)}><option value="">Todas</option>{fontes.map((f) => <option key={f} value={f}>{FONTE_LABEL[f] ?? f}</option>)}</select></label>
          <label className="f">Buscar<input placeholder="bairro, rua, título" value={busca} onChange={(e) => setBusca(e.target.value)} /></label>
        </div>
        <div className="resumo">
          <label className="chk"><input type="checkbox" checked={soPassam} onChange={(e) => setSoPassam(e.target.checked)} /> Só os que passam no padrão (faixa + deságio + margem)</label>
          <label className="chk"><input type="checkbox" checked={crit.soRegiao} onChange={(e) => setCrit({ ...crit, soRegiao: e.target.checked })} /> Só região Sorocaba e ABC</label>
          <label className="chk"><input type="checkbox" checked={ocultarVeto} onChange={(e) => setOcultarVeto(e.target.checked)} /> Ocultar vetados (fiduciante, fração ideal)</label>
        </div>
        <div className="resumo"><span><b>{lista.length}</b> imóveis na lista</span><span><b>{go}</b> GO</span><span>de <b>{imoveis.length}</b> coletados</span></div>
      </div>

      {lista.length === 0 ? <div className="card vazio">Nenhum imóvel passa nesses critérios. Afrouxe a faixa ou desmarque o filtro de padrão.</div> : (
        <div className="card tblwrap">
          <table className="tbl">
            <thead><tr>
              <th onClick={() => setOrdem("score")}>Score</th><th>Imóvel</th><th>Cidade</th><th>Modalidade</th>
              <th className="num" onClick={() => setOrdem("avaliacao")}>Avaliação</th><th className="num" onClick={() => setOrdem("lance")}>Lance mín.</th>
              <th className="num" onClick={() => setOrdem("desagio")}>Deságio</th><th className="num" onClick={() => setOrdem("margem")}>Margem líq.</th>
              <th className="num">Lance máx. 30%</th><th onClick={() => setOrdem("data")}>Leilão</th>
            </tr></thead>
            <tbody>{lista.slice(0, 400).map(({ i, a }) => (
              <tr key={i.id}>
                <td><span className="score">{a.score}</span><br /><span className={`badge ${a.classe}`}>{a.classe === "go" ? "GO" : a.classe === "atencao" ? "ATENÇÃO" : "NO-GO"}</span></td>
                <td><Link className="tit" href={`/imovel/${encodeURIComponent(i.id)}`}>{i.titulo}</Link><br />
                  <span className="sub">{[i.tipo, i.bairro, i.area_privativa_m2 ? `${i.area_privativa_m2} m²` : null, i.quartos ? `${i.quartos}q` : null].filter(Boolean).join(" · ")}
                  {i.ocupado === true ? " · ocupado" : i.ocupado === false ? " · desocupado" : ""}</span></td>
                <td>{i.cidade}<br /><span className="sub">{a.regiao !== "Outra" ? a.regiao : ""}</span></td>
                <td>{MODALIDADE_LABEL[i.modalidade]}<br /><span className="sub">{FONTE_LABEL[i.fonte] ?? i.fonte}{i.praca ? ` · ${i.praca}ª praça` : ""}</span></td>
                <td className="num">{brl(i.avaliacao)}</td><td className="num">{brl(i.lance_minimo)}</td>
                <td className="num">{pct(i.desagio_pct)}</td><td className="num">{pct(a.res.margem)}</td>
                <td className="num">{brl(a.res.lanceMax30)}</td>
                <td>{i.data_leilao ? new Date(i.data_leilao + "T12:00:00").toLocaleDateString("pt-BR") : "-"}</td>
              </tr>))}</tbody>
          </table>
          {lista.length > 400 && <p className="sub" style={{ padding: 10 }}>Mostrando 400 de {lista.length}. Refine os filtros.</p>}
        </div>
      )}
    </>
  );
}
