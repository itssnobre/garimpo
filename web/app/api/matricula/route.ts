import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { tServer } from "@/lib/i18n/server";
import { quemChama } from "@/lib/supabase/admin";
import { permitir } from "@/lib/limite";
import { origemOk } from "@/lib/origem";
export const runtime = "nodejs";
export const maxDuration = 120;

const TETO_MB = 15;
const POR_DIA = 5;

const SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["resumo", "risco_geral", "onus", "alertas", "ok", "perguntas", "custos_previstos"],
  properties: {
    resumo: { type: "string" }, risco_geral: { type: "string", enum: ["baixo", "medio", "alto", "veto"] }, proprietario: { type: "string" },
    onus: { type: "array", items: { type: "string" } }, alertas: { type: "array", items: { type: "string" } }, ok: { type: "array", items: { type: "string" } },
    perguntas: { type: "array", items: { type: "string" } }, custos_previstos: { type: "array", items: { type: "string" } },
  },
};

const SISTEMA = `Você é analista de diligência de leilão de imóveis no Brasil, trabalhando para um investidor experiente que compra para revender com margem líquida mínima de 25%.
Leia a matrícula (ou edital) inteira, averbação por averbação, e responda em português, sem travessões, direto ao ponto.
Regras fixas do investidor (aplique como veto quando aparecerem):
1. Venda de "direitos de devedor fiduciante" ou cessão de direitos com dívida embutida = VETO.
2. Fração ideal / parte ideal = VETO.
3. Origem por doação municipal com cláusula de retrocessão ou inalienabilidade = VETO.
4. Consolidação de propriedade (alienação fiduciária) com intimação por edital em vez de pessoal = risco alto (anulatória).
5. Execução condominial, penhora trabalhista, indisponibilidade, usufruto vitalício, hipoteca não baixada = listar em onus com o número da averbação/registro e o que fazer.
6. Débitos: dizer o que a matrícula indica (ações, execuções) e o que precisa ser checado fora dela (condomínio com síndico, IPTU na prefeitura).
Em custos_previstos, estime em R$ quando houver base (ex.: saldo de execução indicado). Em perguntas, liste o que perguntar ao leiloeiro/síndico/cartório antes do lance.
Se o documento não for uma matrícula nem edital, diga isso no resumo com risco_geral "alto".`;

export async function POST(req: Request) {
  const t = await tServer();
  if (!origemOk(req)) return new NextResponse(t("Origem não permitida."), { status: 403 });
  // Sessão exigida dentro da rota: o proxy cobre o caminho normal, mas a rota não pode depender só dele.
  const quem = await quemChama();
  if (!quem) return new NextResponse(t("Entre na sua conta."), { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) return new NextResponse(t("ANTHROPIC_API_KEY não configurada no servidor"), { status: 500 });
  const limite = await permitir(`matricula:${quem.id}`, POR_DIA, 24 * 60 * 60);
  if (!limite.ok) return new NextResponse(t("Limite de {n} análises de matrícula por dia atingido. Tente amanhã.", { n: POR_DIA }), { status: 429 });
  const fd = await req.formData();
  const file = fd.get("file");
  if (!(file instanceof File)) return new NextResponse(t("Envie um PDF"), { status: 400 });
  if (file.size > TETO_MB * 1024 * 1024) return new NextResponse(t("PDF acima de {n} MB", { n: TETO_MB }), { status: 413 });
  const bytes = Buffer.from(await file.arrayBuffer());
  // Assinatura do arquivo, não a extensão nem o content-type que o navegador mandou.
  if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") return new NextResponse(t("O arquivo não é um PDF."), { status: 400 });
  const contexto = String(fd.get("contexto") ?? "").slice(0, 4000);
  const data = bytes.toString("base64");
  const client = new Anthropic();
  try {
    const msg = await client.messages.create({
      model: process.env.GARIMPO_MODEL || "claude-opus-5",
      max_tokens: 4000, system: SISTEMA,
      tools: [{ name: "resultado", description: "Entrega a análise estruturada", input_schema: SCHEMA as never }],
      tool_choice: { type: "tool", name: "resultado" },
      messages: [{ role: "user", content: [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data } },
        { type: "text", text: `Contexto do lote (da plataforma de leilão): ${contexto}\n\nAnalise o documento e chame a ferramenta "resultado".` },
      ] }],
    });
    const tool = msg.content.find((b) => b.type === "tool_use");
    if (!tool || tool.type !== "tool_use") return new NextResponse(t("Sem resultado estruturado"), { status: 502 });
    return NextResponse.json(tool.input);
  } catch (e) {
    // O erro do provedor pode carregar detalhe de infraestrutura: fica no log do servidor.
    console.error("[matricula] falha na análise:", (e as Error).message ?? e);
    return new NextResponse(t("Não deu para analisar o documento agora. Tente de novo em alguns minutos."), { status: 502 });
  }
}
