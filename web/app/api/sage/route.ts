import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { IMOVEIS, META } from "@/lib/data";
import { avaliar, brl, pct, CRITERIOS_PADRAO, CUSTOS_PADRAO } from "@/lib/motor";
export const runtime = "nodejs"; export const maxDuration = 60;

function resumo(i: (typeof IMOVEIS)[number]) {
  const a = avaliar(i, CRITERIOS_PADRAO);
  return `- [${i.id}] ${i.titulo} | ${i.cidade}${i.bairro ? "/" + i.bairro : ""} | ${i.modalidade} ${i.fonte} | aval ${brl(i.avaliacao)} lance ${brl(i.lance_minimo)} deságio ${pct(i.desagio_pct)} | margem líq ${pct(a.res.margem)} | máx30 ${brl(a.res.lanceMax30)} | score ${a.score} ${a.classe} | leilão ${i.data_leilao ?? "?"} praça ${i.praca ?? "?"} | ocupado ${i.ocupado ?? "?"} | matr ${i.matricula ?? "?"} | sinais: ${a.sinais.map((s) => s.nivel + ":" + s.texto).join("; ") || "nenhum"}`;
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ texto: "O Sage ainda não está ligado neste servidor: falta a chave ANTHROPIC_API_KEY nas variáveis do Vercel. Assim que entrar, eu respondo aqui." });
  const { mensagens, loteId } = (await req.json()) as { mensagens: { role: "user" | "assistant"; content: string }[]; loteId?: string };
  const lote = loteId ? IMOVEIS.find((i) => i.id === loteId) : undefined;
  const top = IMOVEIS.map((i) => ({ i, a: avaliar(i, CRITERIOS_PADRAO) })).filter((x) => x.a.classe === "go").sort((x, y) => y.a.score - x.a.score).slice(0, 40).map((x) => resumo(x.i)).join("\n");
  const ultima = mensagens[mensagens.length - 1]?.content.toLowerCase() ?? "";
  const termos = ultima.split(/\W+/).filter((t) => t.length > 3);
  const relacionados = termos.length ? IMOVEIS.filter((i) => termos.some((t) => (i.cidade + " " + (i.bairro ?? "") + " " + i.titulo).toLowerCase().includes(t))).slice(0, 25).map(resumo).join("\n") : "";
  const sistema = `Você é o Sage, a inteligência da Lotwise, plataforma de leilão de imóveis em São Paulo. Fala português do Brasil, direto, sem travessões, como um analista sênior que já perdeu dinheiro em leilão e aprendeu.
Padrão do investidor: faixa de avaliação 200 a 250 mil, deságio mínimo 40%, margem líquida mínima 25% (alvo 30 a 35%) depois de todos os custos, região prioritária Sorocaba e ABC. Vetos: direitos de fiduciante, fração ideal, doação com retrocessão.
Custos padrão do motor: leiloeiro ${CUSTOS_PADRAO.leiloeiro}%, ITBI ~${CUSTOS_PADRAO.itbi}%, registro ${CUSTOS_PADRAO.registro}%, advogado R$ ${CUSTOS_PADRAO.advogado}, certidões R$ ${CUSTOS_PADRAO.certidoes}, carrego ${CUSTOS_PADRAO.meses} meses x R$ ${CUSTOS_PADRAO.mensal}, corretagem ${CUSTOS_PADRAO.corretagem}%, IR ${CUSTOS_PADRAO.ir}% sobre o ganho, venda ${CUSTOS_PADRAO.descontoVenda}% abaixo da avaliação. Margem = lucro líquido / capital total.
Base: ${META.total} lotes de ${Object.keys(META.fontes).length} fontes, coleta ${META.gerado_em}.
Quando citar um lote, use o título e a cidade e ofereça o link /app/imovel/<id>. Nunca invente lote, valor ou matrícula: use só os dados abaixo. Se não souber, diga o que precisa (matrícula, edital). Seja curto: no máximo 8 linhas, listas quando comparar.

${lote ? "LOTE ABERTO PELO USUÁRIO:\n" + resumo(lote) + "\nDescrição da fonte: " + (lote.descricao ?? "").slice(0, 1500) + "\n" : ""}
TOP 40 QUE PASSAM NO PADRÃO HOJE:\n${top}
${relacionados ? "\nLOTES RELACIONADOS À PERGUNTA:\n" + relacionados : ""}`;
  try {
    const client = new Anthropic();
    const r = await client.messages.create({ model: process.env.SAGE_MODEL || "claude-sonnet-5", max_tokens: 900, system: sistema, messages: mensagens.slice(-12) });
    const texto = r.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n");
    return NextResponse.json({ texto });
  } catch (e) { return NextResponse.json({ texto: "Não consegui responder agora: " + String((e as Error).message ?? e) }, { status: 200 }); }
}
