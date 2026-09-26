// Limite de uso por usuário nas rotas caras (IA e verificação ao vivo).
// Janela fixa gravada em lotwise_uso, com a chave de serviço (o usuário não enxerga nem edita a tabela).
// Falha aberta de propósito: se a tabela ainda não existe ou o banco tropeça, o produto continua de pé.
import "server-only";
import { supabaseAdmin } from "./supabase/admin";

const TABELA = "lotwise_uso";

/** Início da janela atual, em ISO, para janelas fixas de `janelaSeg` segundos. */
function inicioJanela(janelaSeg: number): string {
  const ms = Math.max(1, janelaSeg) * 1000;
  return new Date(Math.floor(Date.now() / ms) * ms).toISOString();
}

/**
 * Conta mais um uso de `chave` na janela atual.
 * ok=false quando o teto `max` já foi alcançado. `restante` é quanto sobra depois desta chamada.
 */
export async function permitir(chave: string, max: number, janelaSeg: number): Promise<{ ok: boolean; restante: number }> {
  const admin = supabaseAdmin();
  if (!admin) return { ok: true, restante: max };
  const janela_inicio = inicioJanela(janelaSeg);
  try {
    // Caminho atômico: o banco soma e devolve a contagem numa instrução só, então requisições
    // simultâneas não passam juntas pelo teto. Sem a função (migration ainda não aplicada), cai no caminho antigo.
    const rpc = await admin.rpc("lotwise_uso_incrementar", { p_chave: chave, p_janela: janela_inicio });
    if (!rpc.error && typeof rpc.data === "number") {
      if (rpc.data > max) return { ok: false, restante: 0 };
      return { ok: true, restante: Math.max(0, max - rpc.data) };
    }
    const { data, error } = await admin
      .from(TABELA)
      .select("contagem")
      .eq("chave", chave)
      .eq("janela_inicio", janela_inicio)
      .maybeSingle();
    if (error) {
      console.error("[limite] leitura de", TABELA, "falhou:", error.message);
      return { ok: true, restante: max };
    }
    const atual = Number(data?.contagem ?? 0);
    if (atual >= max) return { ok: false, restante: 0 };
    const { error: erroGravacao } = await admin
      .from(TABELA)
      .upsert({ chave, janela_inicio, contagem: atual + 1 }, { onConflict: "chave,janela_inicio" });
    if (erroGravacao) console.error("[limite] gravação em", TABELA, "falhou:", erroGravacao.message);
    return { ok: true, restante: Math.max(0, max - atual - 1) };
  } catch (e) {
    console.error("[limite] erro inesperado:", (e as Error).message);
    return { ok: true, restante: max };
  }
}

/** IP de quem chama, para limitar visitante sem conta. Na Vercel, x-real-ip e x-forwarded-for vêm da plataforma. */
export function ipDe(req: Request): string {
  const h = req.headers;
  return (h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0] ?? "").trim() || "desconhecido";
}
