"use client";
import Link from "next/link";
import { useBusca } from "@/lib/busca";
import SeletorUF, { useUFs } from "@/components/SeletorUF";
import { avaliarPadrao } from "@/lib/motor";
import { usePadroes } from "@/lib/usePadroes";
import Destaques from "@/components/Destaques";
import Portao from "@/components/Portao";
import { useT } from "@/lib/i18n/client";
import { fmtLang } from "@/lib/fmt";
function Conteudo() {
  const { t } = useT();
  const { ativo, pronto } = usePadroes();
  const { ufs, pronto: ufsProntas, definir } = useUFs(ativo?.ufs);
  // O servidor devolve já filtrado pelo padrão e ordenado por score.
  const { itens, total, carregando } = useBusca({ filtros: { ufs }, padrao: ativo ?? null, soPassam: true, ordem: "score", quantos: 48 });
  if (!pronto) return null;
  if (!ativo) return (<>
    <div className="app-cab"><div><h1>{t("Sugeridos")}</h1><p>{t("Os lotes que passam nas suas regras, ordenados por score.")}</p></div></div>
    <div className="vazio"><b>{t("Sugeridos precisam do seu padrão")}</b>{t("Faixa, deságio, margem, região e vetos são seus. Sem eles não há o que sugerir.")}<p style={{ margin: "14px 0 0" }}><Link href="/app/padrao?novo=1" className="btn ouro">{t("Criar meu padrão")}</Link></p></div>
  </>);
  const go = itens.map((i) => ({ i, a: avaliarPadrao(i, ativo) }));
  const loc = fmtLang() === "en" ? "en-US" : "pt-BR";
  return (<>
    <div className="app-cab"><div><h1>{t("Sugeridos")}</h1><p>{t("{n} lotes passam no padrão \"{nome}\" hoje, ordenados por score.", { n: total.toLocaleString(loc), nome: ativo.nome })}</p></div><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{ufsProntas && <SeletorUF ufs={ufs} onChange={definir} />}<Link href="/app/padrao" className="btn sec">{t("Ajustar padrão")}</Link></div></div>
    {carregando ? <div className="vazio"><b>{t("Carregando lotes…")}</b></div> : go.length === 0 ? <div className="vazio"><b>{t("Nada passa no seu padrão hoje")}</b>{t("Afrouxe alguma regra ou espere a próxima coleta.")}</div> : <Destaques itens={go.slice(0, 48)} />}
  </>);
}
export default function Sugeridos() { const { t } = useT(); return <Portao titulo={t("Sugeridos")}><Conteudo /></Portao>; }
