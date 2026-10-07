"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import type { Imovel } from "@/lib/types";
import { avaliarPadrao, MODALIDADE_LABEL, type Avaliacao } from "@/lib/motor";
import { brl, brlCurto, pct, dataBR } from "@/lib/fmt";
import { usePadroes } from "@/lib/usePadroes";
import { useConta } from "@/lib/conta";
import { contato, MARCA } from "@/lib/marca";
import { enderecoDoPredio, mapsUrl } from "@/lib/util";
import { useT } from "@/lib/i18n/client";
import { IMapa } from "./Icones";

type Cor = "go" | "atencao" | "nogo" | "d4" | "d3" | "d2" | "d1" | "conf" | "fim";
type Ordem = "unidade" | "area" | "lance" | "m2" | "desagio" | "data";
const TETO_TABELA = 20;
const m2 = (i: Imovel) => (i.area_privativa_m2 && i.area_privativa_m2 > 0 ? i.lance_minimo / i.area_privativa_m2 : null);
const porNome = (a: string, b: string) => a.localeCompare(b, "pt-BR", { numeric: true });

export default function Espelho({ itens, hoje }: { itens: Imovel[]; hoje: string }) {
  const { t, lang } = useT();
  const locale = lang === "en" ? "en-US" : "pt-BR";
  const { ativo } = usePadroes();
  const { user, pronto } = useConta();
  const [verEncerrados, setVerEncerrados] = useState(false);
  const [ordem, setOrdem] = useState<{ k: Ordem; asc: boolean }>({ k: "lance", asc: true });
  const [todas, setTodas] = useState(false);

  const aberto = (i: Imovel) => !i.data_leilao || i.data_leilao >= hoje;
  const abertos = itens.filter(aberto);
  const visiveis = verEncerrados ? itens : abertos;
  const encerrados = itens.length - abertos.length;
  const av = useMemo(() => new Map<string, Avaliacao | null>(itens.map((i) => [i.id, ativo ? avaliarPadrao(i, ativo, t) : null])), [itens, ativo, t]);

  const cor = (i: Imovel): Cor => {
    if (!aberto(i)) return "fim";
    const a = av.get(i.id);
    if (a) return a.classe;
    if (i.valor_suspeito || i.desagio_pct >= 0.85) return "conf";
    const d = i.desagio_pct;
    return d >= 0.5 ? "d4" : d >= 0.35 ? "d3" : d >= 0.2 ? "d2" : "d1";
  };

  const ref = itens.find((i) => i.endereco) ?? itens[0];
  const endereco = enderecoDoPredio(ref.endereco) || ref.cidade;
  const lances = visiveis.map((i) => i.lance_minimo);
  const precosM2 = visiveis.map(m2).filter((v): v is number => v !== null);
  const blocosTodos = [...new Set(visiveis.map((i) => i.bloco ?? ""))].sort(porNome);

  // Por bloco: grade andar x final para o que tem posição; o resto vai para a linha "sem posição".
  const blocos = blocosTodos.map((b) => {
    const doBloco = visiveis.filter((i) => (i.bloco ?? "") === b);
    const comPos = doBloco.filter((i) => typeof i.andar === "number" && i.final);
    // Andares e finais contínuos entre o menor e o maior: um andar sem lote em leilão aparece vazio, não some.
    const ns = comPos.map((i) => i.andar as number);
    const andares = !ns.length ? [] : Math.max(...ns) - Math.min(...ns) > 40 ? [...new Set(ns)].sort((x, y) => y - x) : Array.from({ length: Math.max(...ns) - Math.min(...ns) + 1 }, (_, k) => Math.max(...ns) - k);
    const fs = [...new Set(comPos.map((i) => i.final as string))].sort(porNome);
    const fn = fs.map(Number), largura = Math.max(0, ...fs.map((f) => f.length));
    const finais = fs.length && fn.every(Number.isFinite) && Math.max(...fn) - Math.min(...fn) < 12
      ? Array.from({ length: Math.max(...fn) - Math.min(...fn) + 1 }, (_, k) => String(Math.min(...fn) + k).padStart(largura, "0"))
      : fs;
    const celula = new Map<string, Imovel[]>();
    for (const i of comPos) { const k = `${i.andar}|${i.final}`; celula.set(k, [...(celula.get(k) ?? []), i]); }
    // Mais de um lote na mesma unidade (duas fontes, duas praças): o de maior deságio representa a célula.
    for (const l of celula.values()) l.sort((x, y) => y.desagio_pct - x.desagio_pct);
    return { nome: b, andares, finais, celula, total: doBloco.length, semPos: doBloco.filter((i) => !(typeof i.andar === "number" && i.final)).sort((x, y) => porNome(x.unidade ?? "", y.unidade ?? "")) };
  });

  const rotulo = (i: Imovel) => [i.bloco, i.unidade ? t("Apto {u}", { u: i.unidade }) : null].filter(Boolean).join(" · ") || t("Unidade sem número");
  const dica = (i: Imovel) => `${rotulo(i)} · ${t("lance")} ${brl(i.lance_minimo)} · ${t("avaliação")} ${brl(i.avaliacao)}`;
  const selo = (i: Imovel) => (cor(i) === "conf" ? "?" : i.desagio_pct > 0.005 ? `−${pct(i.desagio_pct)}` : t("sem desc."));
  const andarTxt = (n: number) => (n === 0 ? t("T") : t("{n}º", { n }));

  const linhas = useMemo(() => {
    const v = (i: Imovel): number | string => {
      switch (ordem.k) {
        case "unidade": return `${i.bloco ?? ""}|${(i.unidade ?? "").padStart(5, "0")}`;
        case "area": return i.area_privativa_m2 ?? -1;
        case "lance": return i.lance_minimo;
        case "m2": return m2(i) ?? Infinity;
        case "desagio": return i.desagio_pct;
        case "data": return i.data_leilao ?? "9999";
      }
    };
    return [...visiveis].sort((a, b) => { const x = v(a), y = v(b); const c = typeof x === "number" && typeof y === "number" ? x - y : porNome(String(x), String(y)); return ordem.asc ? c : -c; });
  }, [visiveis, ordem]);
  const cab = (k: Ordem, txt: string, num = false) => (
    <th className={num ? "num" : ""} aria-sort={ordem.k === k ? (ordem.asc ? "ascending" : "descending") : undefined}>
      <button type="button" className="condo-ord" onClick={() => setOrdem((o) => ({ k, asc: o.k === k ? !o.asc : k !== "desagio" }))}>{txt}{ordem.k === k ? (ordem.asc ? " ↑" : " ↓") : ""}</button>
    </th>);

  const legenda: [Cor, string][] = ativo
    ? [["go", t("Vale a pena")], ["atencao", t("Atenção")], ["nogo", t("Não vale a pena")]]
    : [["d4", t("deságio 50%+")], ["d3", t("35 a 50%")], ["d2", t("20 a 35%")], ["d1", t("até 20%")]];
  if (visiveis.some((i) => cor(i) === "conf")) legenda.push(["conf", t("valor a conferir")]);
  if (verEncerrados && encerrados > 0) legenda.push(["fim", t("encerrado")]);

  return (
    <>
      <div className="lote-barra">
        <Link href="/app/condominio" className="volta">← {t("Condomínios")}</Link>
        <div className="lote-acoes">
          <a className="btn sec" href={mapsUrl(`${endereco}, ${ref.cidade}, ${ref.uf}`)} target="_blank" rel="noreferrer"><IMapa />{t("Ver no mapa")}</a>
        </div>
      </div>

      <header className="lote-tit condo-tit">
        <p className="lote-eyebrow">{t("Espelho do condomínio")}<span>·</span>{ref.cidade}/{ref.uf}</p>
        <h1>{endereco}</h1>
        {ref.bairro && <p className="lote-end"><IMapa />{ref.bairro} · {ref.cidade}/{ref.uf}</p>}
      </header>

      <div className="stats condo-stats">
        <div className="stat"><b className="num">{abertos.length}</b><span>{t(abertos.length === 1 ? "unidade em leilão" : "unidades em leilão")}</span></div>
        <div className="stat"><b className="num">{lances.length ? (Math.min(...lances) === Math.max(...lances) ? brlCurto(lances[0]) : t("{a} a {b}", { a: brlCurto(Math.min(...lances)), b: brlCurto(Math.max(...lances)) })) : "–"}</b><span>{t("faixa de lance")}</span></div>
        <div className="stat"><b className="num">{precosM2.length ? (precosM2.length === 1 ? brl(precosM2[0]) : t("{a} a {b}", { a: brl(Math.min(...precosM2)), b: brl(Math.max(...precosM2)) })) : "–"}</b><span>{t("lance por m², menor e maior")}</span></div>
        <div className="stat"><b className="num">{blocosTodos.filter(Boolean).length || 1}</b><span>{t(blocosTodos.filter(Boolean).length > 1 ? "blocos ou torres" : "bloco ou torre")}</span></div>
      </div>

      <section className="secao" id="espelho">
        <h2>{t("Espelho por andar")}</h2>
        <p className="lede">{ativo
          ? t("Cada quadrado é um apartamento em leilão, na posição do andar e do final. A cor é a nota do seu padrão \"{p}\".", { p: ativo.nome })
          : t("Cada quadrado é um apartamento em leilão, na posição do andar e do final. A cor é o deságio sobre a avaliação.")}</p>
        {pronto && !ativo && (
          <p className="condo-dica">{user
            ? <>{t("Com o seu padrão, a cor vira a nota de cada unidade.")} <Link href="/app/padrao?novo=1">{t("Criar meu padrão")}</Link></>
            : <>{t("Com uma conta, a cor vira a nota de cada unidade pelas suas regras.")} <Link href={`/entrar?modo=criar&next=${encodeURIComponent(`/app/condominio/${ref.predio_id ?? ""}`)}`}>{t("Criar conta grátis")}</Link></>}</p>)}

        <div className="condo-legenda">
          {legenda.map(([c, txt]) => <span key={c}><i className={`cel-cor ${c}`} />{txt}</span>)}
          {encerrados > 0 && <button type="button" className={`chip ${verEncerrados ? "on" : ""}`} onClick={() => setVerEncerrados((v) => !v)} aria-pressed={verEncerrados}>{t("Mostrar encerrados ({n})", { n: encerrados })}</button>}
        </div>

        {visiveis.length === 0 ? <div className="sinal">{t("Nenhuma unidade com leilão aberto neste prédio agora.")}</div> : (
          <div className="condo-blocos">
            {blocos.map((b) => (
              <div className="condo-bloco" key={b.nome || "_"}>
                <div className="condo-bloco-cab"><b>{b.nome || t("Prédio")}</b><small>{t(b.total === 1 ? "{n} unidade" : "{n} unidades", { n: b.total })}</small></div>
                {b.andares.length > 0 && (
                  <div className="condo-rolo">
                    <div className="condo-grade" style={{ gridTemplateColumns: `34px repeat(${b.finais.length}, minmax(50px, 1fr))` }} role="grid" aria-label={t("Unidades de {b} por andar e final", { b: b.nome || t("Prédio") })}>
                      <span className="condo-canto" />
                      {b.finais.map((f) => <span key={f} className="condo-final">{t("final {f}", { f })}</span>)}
                      {b.andares.map((a) => (
                        <div className="condo-linha" role="row" key={a}>
                          <span className="condo-andar">{andarTxt(a)}</span>
                          {b.finais.map((f) => {
                            const l = b.celula.get(`${a}|${f}`);
                            if (!l) return <span key={f} className="cel vazia" aria-hidden />;
                            const i = l[0];
                            return (
                              <Link key={f} href={`/app/imovel/${encodeURIComponent(i.id)}`} className={`cel ${cor(i)}`} title={dica(i)} role="gridcell">
                                <b>{i.unidade}</b>
                                <small>{selo(i)}</small>
                                {l.length > 1 && <em title={t("{n} lotes para esta unidade", { n: l.length })}>{l.length}</em>}
                              </Link>);
                          })}
                        </div>))}
                    </div>
                  </div>)}
                {b.semPos.length > 0 && (
                  <div className="condo-sempos">
                    <span>{t("sem posição")}</span>
                    {b.semPos.map((i) => <Link key={i.id} href={`/app/imovel/${encodeURIComponent(i.id)}`} className={`cel solta ${cor(i)}`} title={dica(i)}><b>{i.unidade ?? "?"}</b><small>{selo(i)}</small></Link>)}
                  </div>)}
              </div>))}
          </div>)}
        <p className="condo-nota">{t("A posição sai do número da unidade (1203 = 12º andar, final 03). Unidades que não estão em leilão não aparecem: o prédio pode ter mais andares e finais.")}</p>
      </section>

      {visiveis.length > 0 && (
        <section className="secao" id="comparar">
          <h2>{t("Comparar unidades")}</h2>
          <p className="lede">{t("Mesmo prédio, mesma rua, mesmo condomínio: a diferença de preço entre vizinhos é a melhor referência que existe.")}</p>
          <div className="condo-rolo">
            <table className="tabela condo-tabela">
              <thead><tr>
                {cab("unidade", t("Unidade"))}{cab("area", t("Área"), true)}{cab("lance", t("Lance"), true)}
                <th className="num">{t("Avaliação")}</th>
                {cab("m2", t("R$/m²"), true)}{cab("desagio", t("Deságio"), true)}
                <th>{t("Modalidade")}</th>{cab("data", t("Leilão"))}
                {ativo && <th className="num">{t("Score")}</th>}
              </tr></thead>
              <tbody>{(todas ? linhas : linhas.slice(0, TETO_TABELA)).map((i) => {
                const a = av.get(i.id); const v = m2(i);
                return (
                  <tr key={i.id} className={aberto(i) ? "" : "fim"}>
                    <td><Link href={`/app/imovel/${encodeURIComponent(i.id)}`} className="condo-unid"><i className={`cel-cor ${cor(i)}`} />{rotulo(i)}</Link></td>
                    <td className="num">{i.area_privativa_m2 ? t("{v} m²", { v: i.area_privativa_m2.toLocaleString(locale) }) : "–"}</td>
                    <td className="num"><b>{brl(i.lance_minimo)}</b></td>
                    <td className="num">{brl(i.avaliacao)}</td>
                    <td className="num">{v ? brl(v) : "–"}</td>
                    <td className="num">{i.valor_suspeito || i.desagio_pct >= 0.85 ? t("a conferir") : pct(i.desagio_pct)}</td>
                    <td>{t(MODALIDADE_LABEL[i.modalidade] ?? "Outro")}</td>
                    <td>{i.data_leilao ? dataBR(i.data_leilao) : t("sem data")}</td>
                    {ativo && <td className="num">{a ? a.score : "–"}</td>}
                  </tr>);
              })}</tbody>
            </table>
          </div>
          {!todas && linhas.length > TETO_TABELA && <p className="condo-mais"><button type="button" className="btn sec mini" onClick={() => setTodas(true)}>{t("Mostrar todas as {n} unidades", { n: linhas.length })}</button></p>}
        </section>)}

      <div className="cta-lote condo-cta">
        <b>{t("Quer arrematar neste condomínio?")}</b>
        <p>{t("Lemos matrícula e edital de cada unidade, fechamos o lance máximo e acompanhamos o pregão. 3% só se você arrematar.")}</p>
        <a className="btn ouro" href={contato(t("Olá, quero assessoria da {marca} para os apartamentos em leilão em {end} ({cidade}/{uf}).", { marca: MARCA, end: endereco, cidade: ref.cidade, uf: ref.uf }))} target="_blank" rel="noreferrer">{t("Pedir assessoria")}</a>
      </div>
    </>
  );
}
