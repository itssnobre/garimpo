import Link from "next/link";
import { tServer } from "@/lib/i18n/server";
export async function generateMetadata() {
  const t = await tServer();
  return { title: t("Jurídico") };
}
const REGRAS = [
  ["Direitos de devedor fiduciante", "veto", "Você compra a dívida junto com o imóvel. Nunca."],
  ["Fração ideal / parte ideal", "veto", "Copropriedade com estranho, sem posse plena. Nunca."],
  ["Origem por doação com retrocessão ou inalienabilidade", "veto", "O imóvel pode voltar ao doador. Confira a origem na matrícula."],
  ["Consolidação com intimação por edital", "alerta", "Risco de ação anulatória. Prefira intimação pessoal comprovada."],
  ["Leilão SFI (Caixa) com débitos 100% do comprador", "alerta", "Sem teto pra condomínio atrasado. Levante o saldo com o síndico antes."],
  ["Licitação Aberta (Caixa)", "info", "Costuma limitar condomínio a 10% da avaliação. Mais seguro."],
  ["Judicial (Mega, Zuk, Lance)", "alerta", "Avaliação pode estar inflada; IPTU e débitos em geral sub-rogam no preço (não herda). Confira comparáveis do laudo."],
  ["Comissão do leiloeiro", "info", "5% por fora, em qualquer modalidade. Já está na calculadora."],
  ["Ocupado", "alerta", "Desocupação custa tempo e dinheiro. Preveja 3 a 12 meses e advogado."],
];
export default async function Juridico() {
  const t = await tServer();
  return (<>
    <div className="app-cab"><div><h1>{t("Jurídico")}</h1><p>{t("As regras que o motor aplica em cada lote, e o que checar na matrícula antes do lance.")}</p></div></div>
    <div className="doisdois">
      <div className="painel"><h2>{t("Regras do motor")}</h2>{REGRAS.map(([n, cls, d]) => <div key={n} className={`sinal ${cls}`}><b>{t(n)}.</b> {t(d)}</div>)}</div>
      <div className="painel"><h2>{t("Análise de matrícula com Sage")}</h2><p style={{ color: "var(--mute)", fontSize: 14 }}>{t("Abra qualquer lote e suba o PDF da matrícula na Parte 2 (Riscos). A IA lê averbação por averbação e devolve ônus, execuções, cláusulas, custos previstos e as perguntas a fazer ao leiloeiro. Também pode conversar com o")} <Link href="/app/sage" style={{ textDecoration: "underline" }}>{t("Sage")}</Link> {t("sobre um caso específico.")}</p></div>
    </div>
  </>);
}
