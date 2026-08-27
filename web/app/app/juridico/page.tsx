import Link from "next/link";
export const metadata = { title: "Jurídico" };
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
export default function Juridico() {
  return (<>
    <div className="app-cab"><div><h1>Jurídico</h1><p>As regras que o motor aplica em cada lote, e o que checar na matrícula antes do lance.</p></div></div>
    <div className="doisdois">
      <div className="painel"><h2>Regras do motor</h2>{REGRAS.map(([t, n, d]) => <div key={t} className={`sinal ${n}`}><b>{t}.</b> {d}</div>)}</div>
      <div className="painel"><h2>Análise de matrícula com Sage</h2><p style={{ color: "var(--musgo)", fontSize: 14 }}>Abra qualquer lote e suba o PDF da matrícula na Parte 1. A IA lê averbação por averbação e devolve ônus, execuções, cláusulas, custos previstos e as perguntas a fazer ao leiloeiro. Também pode conversar com o <Link href="/app/sage" style={{ textDecoration: "underline" }}>Sage</Link> sobre um caso específico.</p>
        <h2 style={{ marginTop: 18 }}>Checklist padrão</h2><ul className="check">{["Edital lido inteiro", "Matrícula atualizada (30 dias)", "Intimação pessoal na consolidação", "Débitos com síndico e prefeitura", "3 comparáveis no entorno", "Ocupação verificada", "Lance máximo definido antes"].map((t) => <li key={t}><input type="checkbox" disabled /><span>{t}</span></li>)}</ul></div>
    </div>
  </>);
}
