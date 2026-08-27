import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { IMOVEIS, META } from "@/lib/data";
import { avaliarPadrao, brl, pct, REGRAS_BASE, CUSTOS_PADRAO, type Regras } from "@/lib/motor";
export const runtime = "nodejs"; export const maxDuration = 60;

let REGRAS: Regras = REGRAS_BASE;
function resumo(i: (typeof IMOVEIS)[number]) {
  const a = avaliarPadrao(i, REGRAS);
  return `- [${i.id}] ${i.titulo} | ${i.cidade}${i.bairro ? "/" + i.bairro : ""} | ${i.modalidade} ${i.fonte} | aval ${brl(i.avaliacao)} lance ${brl(i.lance_minimo)} deságio ${pct(i.desagio_pct)} | margem líq ${pct(a.res.margem)} | máx30 ${brl(a.res.lanceMax30)} | score ${a.score} ${a.classe} | leilão ${i.data_leilao ?? "?"} praça ${i.praca ?? "?"} | ocupado ${i.ocupado ?? "?"} | matr ${i.matricula ?? "?"} | sinais: ${a.sinais.map((s) => s.nivel + ":" + s.texto).join("; ") || "nenhum"}`;
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ texto: "O Sage ainda não está ligado neste servidor: falta a chave ANTHROPIC_API_KEY nas variáveis do Vercel. Assim que entrar, eu respondo aqui." });
  const { mensagens, loteId, padrao } = (await req.json()) as { mensagens: { role: "user" | "assistant"; content: string }[]; loteId?: string; padrao?: Regras & { nome?: string } };
  REGRAS = padrao ?? REGRAS_BASE;
  const lote = loteId ? IMOVEIS.find((i) => i.id === loteId) : undefined;
  const top = IMOVEIS.map((i) => ({ i, a: avaliarPadrao(i, REGRAS) })).filter((x) => x.a.passa).sort((x, y) => y.a.score - x.a.score).slice(0, 40).map((x) => resumo(x.i)).join("\n");
  const ultima = mensagens[mensagens.length - 1]?.content.toLowerCase() ?? "";
  const termos = ultima.split(/\W+/).filter((t) => t.length > 3);
  const relacionados = termos.length ? IMOVEIS.filter((i) => termos.some((t) => (i.cidade + " " + (i.bairro ?? "") + " " + i.titulo).toLowerCase().includes(t))).slice(0, 25).map(resumo).join("\n") : "";
  const sistema = `Você é o Sage, a inteligência da Lotwise, plataforma de leilão de imóveis em São Paulo. Fala português do Brasil, direto, sem travessões, como um analista sênior que já perdeu dinheiro em leilão e aprendeu.
Padrão do usuário${padrao?.nome ? " (" + padrao.nome + ")" : " (base neutra, ele ainda não definiu o dele)"}: avaliação ${REGRAS.faixaMin ? "de " + brl(REGRAS.faixaMin) : "sem mínimo"} ${REGRAS.faixaMax ? "até " + brl(REGRAS.faixaMax) : "sem teto"}, deságio mínimo ${pct(REGRAS.desagioMin)}, margem líquida mínima ${pct(REGRAS.margemMin)} (alvo ${pct(REGRAS.margemAlvo)}), região ${[...REGRAS.ufs, ...REGRAS.cidades].join(", ") || "Brasil inteiro"}, tipos ${REGRAS.tipos.join(", ") || "todos"}, ocupação ${REGRAS.ocupacao}. Vetos: ${[REGRAS.vetoFiduciante && "direitos de fiduciante", REGRAS.vetoFracao && "fração ideal", REGRAS.vetoEdital && "intimação por edital"].filter(Boolean).join(", ") || "nenhum"}. Respeite o padrão dele, não imponha o seu.
Custos do usuário: leiloeiro ${REGRAS.custos.leiloeiro}%, ITBI ~${REGRAS.custos.itbi}%, registro ${REGRAS.custos.registro}%, advogado R$ ${REGRAS.custos.advogado}, certidões R$ ${REGRAS.custos.certidoes}, carrego ${REGRAS.custos.meses} meses x R$ ${REGRAS.custos.mensal}, corretagem ${REGRAS.custos.corretagem}%, IR ${REGRAS.custos.ir}%, venda ${REGRAS.custos.descontoVenda}% abaixo da avaliação. Margem = lucro líquido / capital total.
Base: ${META.total} lotes de ${Object.keys(META.fontes).length} fontes, coleta ${META.gerado_em}.
Quando citar um lote, use o título e a cidade e ofereça o link /app/imovel/<id>. Nunca invente lote, valor ou matrícula: use só os dados abaixo. Se não souber, diga o que precisa (matrícula, edital). Seja curto: no máximo 8 linhas, listas quando comparar.

${lote ? "LOTE ABERTO PELO USUÁRIO:\n" + resumo(lote) + "\nDescrição da fonte: " + (lote.descricao ?? "").slice(0, 1500) + "\n" : ""}
TOP 40 QUE PASSAM NO PADRÃO DO USUÁRIO HOJE:\n${top}
${relacionados ? "\nLOTES RELACIONADOS À PERGUNTA:\n" + relacionados : ""}`;
  try {
    const client = new Anthropic();
    const r = await client.messages.create({ model: process.env.SAGE_MODEL || "claude-sonnet-5", max_tokens: 900, system: sistema, messages: mensagens.slice(-12) });
    const texto = r.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n");
    return NextResponse.json({ texto });
  } catch (e) { return NextResponse.json({ texto: "Não consegui responder agora: " + String((e as Error).message ?? e) }, { status: 200 }); }
}
