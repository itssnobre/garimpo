import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { META } from "@/lib/data";
import { TODOS as IMOVEIS } from "@/lib/dadosCompletos";
import { avaliarPadrao, brl, pct, type Regras } from "@/lib/motor";
import { supabaseServer } from "@/lib/supabase/server";
export const runtime = "nodejs"; export const maxDuration = 60;

// Sem padrão do usuário, o Sage descreve o lote cru (sem margem, teto ou score): a conta é sempre com as regras dele.
function resumoCom(REGRAS: Regras | null) {
  return (i: (typeof IMOVEIS)[number]) => {
    const base = `- [${i.id}] ${i.titulo} | ${i.cidade}${i.bairro ? "/" + i.bairro : ""} | ${i.modalidade} ${i.fonte} | aval ${brl(i.avaliacao)} lance ${brl(i.lance_minimo)} deságio ${pct(i.desagio_pct)}`;
    const fim = ` | leilão ${i.data_leilao ?? "?"} praça ${i.praca ?? "?"} | ocupado ${i.ocupado ?? "?"} | matr ${i.matricula ?? "?"}`;
    if (!REGRAS) return base + fim + (i.direitos_fiduciante ? " | direitos de fiduciante" : "") + (i.fracao_ideal ? " | fração ideal" : "");
    const a = avaliarPadrao(i, REGRAS);
    return `${base} | margem líq ${pct(a.res.margem)} | máx30 ${brl(a.res.lanceMax30)} | score ${a.score} ${a.classe}${fim} | sinais: ${a.sinais.map((s) => s.nivel + ":" + s.texto).join("; ") || "nenhum"}`;
  };
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ texto: "O Sage ainda não está ligado neste servidor: falta a chave ANTHROPIC_API_KEY nas variáveis do Vercel. Assim que entrar, eu respondo aqui." });
  const sb = await supabaseServer();
  if (sb) { const { data } = await sb.auth.getUser(); if (!data.user) return NextResponse.json({ texto: "Entre na sua conta para conversar com o Sage." }, { status: 401 }); }
  const { mensagens, loteId, padrao } = (await req.json()) as { mensagens: { role: "user" | "assistant"; content: string }[]; loteId?: string; padrao?: (Regras & { nome?: string }) | null };
  const REGRAS: Regras | null = padrao ?? null; const resumo = resumoCom(REGRAS);
  const lote = loteId ? IMOVEIS.find((i) => i.id === loteId) : undefined;
  const top = REGRAS ? IMOVEIS.map((i) => ({ i, a: avaliarPadrao(i, REGRAS) })).filter((x) => x.a.passa).sort((x, y) => y.a.score - x.a.score).slice(0, 40).map((x) => resumo(x.i)).join("\n")
    : IMOVEIS.filter((i) => !i.direitos_fiduciante && !i.fracao_ideal).sort((x, y) => y.desagio_pct - x.desagio_pct).slice(0, 40).map(resumo).join("\n");
  const ultima = mensagens[mensagens.length - 1]?.content.toLowerCase() ?? "";
  const termos = ultima.split(/\W+/).filter((t) => t.length > 3);
  const relacionados = termos.length ? IMOVEIS.filter((i) => termos.some((t) => (i.cidade + " " + (i.bairro ?? "") + " " + i.titulo).toLowerCase().includes(t))).slice(0, 25).map(resumo).join("\n") : "";
  const sistema = `Você é o Sage, a inteligência da Lotwise, plataforma de leilão de imóveis do Brasil inteiro. Fala português do Brasil, direto, sem travessões, como um analista sênior que já perdeu dinheiro em leilão e aprendeu.
${REGRAS ? `Padrão do usuário${padrao?.nome ? " (" + padrao.nome + ")" : ""}: avaliação ${REGRAS.faixaMin ? "de " + brl(REGRAS.faixaMin) : "sem mínimo"} ${REGRAS.faixaMax ? "até " + brl(REGRAS.faixaMax) : "sem teto"}, deságio mínimo ${pct(REGRAS.desagioMin)}, margem líquida mínima ${pct(REGRAS.margemMin)} (alvo ${pct(REGRAS.margemAlvo)}), região ${[...REGRAS.ufs, ...REGRAS.cidades].join(", ") || "Brasil inteiro"}, tipos ${REGRAS.tipos.join(", ") || "todos"}, ocupação ${REGRAS.ocupacao}. Vetos: ${[REGRAS.vetoFiduciante && "direitos de fiduciante", REGRAS.vetoFracao && "fração ideal", REGRAS.vetoEdital && "intimação por edital"].filter(Boolean).join(", ") || "nenhum"}. Respeite o padrão dele, não imponha o seu.
Custos do usuário: leiloeiro ${REGRAS.custos.leiloeiro}%, ITBI ~${REGRAS.custos.itbi}%, registro ${REGRAS.custos.registro}%, advogado R$ ${REGRAS.custos.advogado}, certidões R$ ${REGRAS.custos.certidoes}, carrego ${REGRAS.custos.meses} meses x R$ ${REGRAS.custos.mensal}, corretagem ${REGRAS.custos.corretagem}%, IR ${REGRAS.custos.ir}%, venda ${REGRAS.custos.descontoVenda}% abaixo da avaliação. Margem = lucro líquido / capital total.`
  : "O usuário AINDA NÃO DEFINIU o padrão dele (faixa, deságio, margem, região, vetos, custos). Por isso não há margem, teto de lance nem score: não invente números de margem ou lance máximo. Ajude com os dados crus (avaliação, lance, deságio, cidade, modalidade) e, quando fizer sentido, sugira criar o padrão em /app/padrao."}
Base: ${META.total} lotes de ${Object.keys(META.fontes).length} fontes, coleta ${META.gerado_em}.
Quando citar um lote, use o título e a cidade e ofereça o link /app/imovel/<id>. Nunca invente lote, valor ou matrícula: use só os dados abaixo. Se não souber, diga o que precisa (matrícula, edital). Seja curto: no máximo 8 linhas, listas quando comparar.

${lote ? "LOTE ABERTO PELO USUÁRIO:\n" + resumo(lote) + "\nDescrição da fonte: " + (lote.descricao ?? "").slice(0, 1500) + "\n" : ""}
${REGRAS ? "TOP 40 QUE PASSAM NO PADRÃO DO USUÁRIO HOJE:" : "40 LOTES COM MAIOR DESÁGIO (sem padrão definido):"}\n${top}
${relacionados ? "\nLOTES RELACIONADOS À PERGUNTA:\n" + relacionados : ""}`;
  try {
    const client = new Anthropic();
    const r = await client.messages.create({ model: process.env.SAGE_MODEL || "claude-sonnet-5", max_tokens: 900, system: sistema, messages: mensagens.slice(-12) });
    const texto = r.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n");
    return NextResponse.json({ texto });
  } catch (e) { return NextResponse.json({ texto: "Não consegui responder agora: " + String((e as Error).message ?? e) }, { status: 200 }); }
}
