import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { META } from "@/lib/data";
import { candidatos, porId, porTermos } from "@/lib/catalogo";
import type { Imovel } from "@/lib/types";
import { avaliarPadrao, brl, pct, type Regras } from "@/lib/motor";
import { supabaseServer } from "@/lib/supabase/server";
import { getLang, tServer } from "@/lib/i18n/server";
import { permitir } from "@/lib/limite";
import { origemOk } from "@/lib/origem";
export const runtime = "nodejs"; export const maxDuration = 60;

const CORPO_MAX = 32 * 1024; // 32 KB: o histórico que a tela manda cabe folgado
const POR_HORA = 30;

// Sem padrão do usuário, o Sage descreve o lote cru (sem margem, teto ou score): a conta é sempre com as regras dele.
function resumoCom(REGRAS: Regras | null) {
  return (i: Imovel) => {
    const base = `- [${i.id}] ${i.titulo} | ${i.cidade}${i.bairro ? "/" + i.bairro : ""} | ${i.modalidade} ${i.fonte} | aval ${brl(i.avaliacao)} lance ${brl(i.lance_minimo)} deságio ${pct(i.desagio_pct)}`;
    const fim = ` | leilão ${i.data_leilao ?? "?"} praça ${i.praca ?? "?"} | ocupado ${i.ocupado ?? "?"} | matr ${i.matricula ?? "?"}`;
    if (!REGRAS) return base + fim + (i.direitos_fiduciante ? " | direitos de fiduciante" : "") + (i.fracao_ideal ? " | fração ideal" : "");
    const a = avaliarPadrao(i, REGRAS);
    return `${base} | margem líq ${pct(a.res.margem)} | máx30 ${brl(a.res.lanceMax30)} | score ${a.score} ${a.classe}${fim} | sinais: ${a.sinais.map((s) => s.nivel + ":" + s.texto).join("; ") || "nenhum"}`;
  };
}

export async function POST(req: Request) {
  const t = await tServer();
  const lang = await getLang();
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ texto: t("O Sage ainda não está ligado neste servidor: falta a chave ANTHROPIC_API_KEY nas variáveis do Vercel. Assim que entrar, eu respondo aqui.") });
  if (!origemOk(req)) return NextResponse.json({ texto: t("Origem não permitida.") }, { status: 403 });
  const sb = await supabaseServer();
  const usuario = sb ? (await sb.auth.getUser()).data.user : null;
  if (!usuario) return NextResponse.json({ texto: t("Entre na sua conta para conversar com o Sage.") }, { status: 401 });
  const limite = await permitir(`sage:${usuario.id}`, POR_HORA, 60 * 60);
  if (!limite.ok) return NextResponse.json({ texto: t("Limite de {n} perguntas ao Sage por hora atingido. Tente daqui a pouco.", { n: POR_HORA }) }, { status: 429 });
  const bruto = await req.text();
  if (bruto.length > CORPO_MAX) return NextResponse.json({ texto: t("Conversa longa demais para uma chamada. Comece um assunto novo.") }, { status: 413 });
  let corpoJson: unknown;
  try { corpoJson = JSON.parse(bruto); } catch { return NextResponse.json({ texto: t("Corpo inválido: esperado JSON.") }, { status: 400 }); }
  const { mensagens, loteId, padrao } = (corpoJson ?? {}) as { mensagens: { role: "user" | "assistant"; content: string }[]; loteId?: string; padrao?: (Regras & { nome?: string }) | null };
  if (!Array.isArray(mensagens)) return NextResponse.json({ texto: t("Informe mensagens: [].") }, { status: 400 });
  const REGRAS: Regras | null = padrao ?? null; const resumo = resumoCom(REGRAS);
  const ultima = String(mensagens[mensagens.length - 1]?.content ?? "").toLowerCase();
  // O banco corta pelos limites objetivos do padrão; o motor avalia só os candidatos que sobraram.
  const [lote, pool, proximos] = await Promise.all([
    loteId ? porId(loteId) : Promise.resolve(null),
    candidatos(REGRAS, 400),
    porTermos(ultima.split(/\W+/), 25),
  ]);
  const top = (REGRAS ? pool.map((i) => ({ i, a: avaliarPadrao(i, REGRAS) })).filter((x) => x.a.passa).sort((x, y) => y.a.score - x.a.score).slice(0, 40).map((x) => x.i)
    : pool.slice(0, 40)).map(resumo).join("\n");
  const relacionados = proximos.map(resumo).join("\n");
  const sistema = `Você é o Sage, a inteligência da Lotwise, plataforma de leilão de imóveis do Brasil inteiro. Fala português do Brasil, direto, sem travessões, como um analista sênior que já perdeu dinheiro em leilão e aprendeu.
${REGRAS ? `Padrão do usuário${padrao?.nome ? " (" + padrao.nome + ")" : ""}: avaliação ${REGRAS.faixaMin ? "de " + brl(REGRAS.faixaMin) : "sem mínimo"} ${REGRAS.faixaMax ? "até " + brl(REGRAS.faixaMax) : "sem teto"}, deságio mínimo ${pct(REGRAS.desagioMin)}, margem líquida mínima ${pct(REGRAS.margemMin)} (alvo ${pct(REGRAS.margemAlvo)}), região ${[...REGRAS.ufs, ...REGRAS.cidades].join(", ") || "Brasil inteiro"}, tipos ${REGRAS.tipos.join(", ") || "todos"}, ocupação ${REGRAS.ocupacao}. Vetos: ${[REGRAS.vetoFiduciante && "direitos de fiduciante", REGRAS.vetoFracao && "fração ideal", REGRAS.vetoEdital && "intimação por edital"].filter(Boolean).join(", ") || "nenhum"}. Respeite o padrão dele, não imponha o seu.
Custos do usuário: leiloeiro ${REGRAS.custos.leiloeiro}%, ITBI ~${REGRAS.custos.itbi}%, registro ${REGRAS.custos.registro}%, advogado R$ ${REGRAS.custos.advogado}, certidões R$ ${REGRAS.custos.certidoes}, carrego ${REGRAS.custos.meses} meses x R$ ${REGRAS.custos.mensal}, corretagem ${REGRAS.custos.corretagem}%, IR ${REGRAS.custos.ir}%, venda ${REGRAS.custos.descontoVenda}% abaixo da avaliação. Margem = lucro líquido / capital total.`
  : "O usuário AINDA NÃO DEFINIU o padrão dele (faixa, deságio, margem, região, vetos, custos). Por isso não há margem, teto de lance nem score: não invente números de margem ou lance máximo. Ajude com os dados crus (avaliação, lance, deságio, cidade, modalidade) e, quando fizer sentido, sugira criar o padrão em /app/padrao."}
Base: ${META.total} lotes de ${Object.keys(META.fontes).length} fontes, coleta ${META.gerado_em}.
Quando citar um lote, use o título e a cidade e ofereça o link /app/imovel/<id>. Nunca invente lote, valor ou matrícula: use só os dados abaixo. Se não souber, diga o que precisa (matrícula, edital). Seja curto: no máximo 8 linhas, listas quando comparar.

${lote ? "LOTE ABERTO PELO USUÁRIO:\n" + resumo(lote) + "\nDescrição da fonte: " + (lote.descricao ?? "").slice(0, 1500) + "\n" : ""}
${REGRAS ? "TOP 40 QUE PASSAM NO PADRÃO DO USUÁRIO HOJE:" : "40 LOTES COM MAIOR DESÁGIO (sem padrão definido):"}\n${top}
${relacionados ? "\nLOTES RELACIONADOS À PERGUNTA:\n" + relacionados : ""}` + (lang === "en" ? "\n\nAnswer in English." : "");
  try {
    const client = new Anthropic();
    const r = await client.messages.create({ model: process.env.SAGE_MODEL || "claude-sonnet-5", max_tokens: 900, system: sistema, messages: mensagens.slice(-12) });
    const texto = r.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n");
    return NextResponse.json({ texto });
  } catch (e) {
    // Mensagem do provedor só no log: pode expor detalhe de infraestrutura ou da chave.
    console.error("[sage] falha na resposta:", (e as Error).message ?? e);
    return NextResponse.json({ texto: t("Não consegui responder agora. Tente de novo em alguns instantes.") }, { status: 200 });
  }
}
