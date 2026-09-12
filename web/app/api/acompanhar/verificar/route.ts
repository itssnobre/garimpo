import { NextResponse } from "next/server";
import { porIds } from "@/lib/catalogo";
import { supabaseServer } from "@/lib/supabase/server";
import { verificarLotes, type EstadoAoVivo } from "@/lib/aovivo";
import { tServer } from "@/lib/i18n/server";
import { permitir } from "@/lib/limite";
import { origemOk } from "@/lib/origem";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const MAX = 30;
const POR_HORA = 60;

/** POST { ids: string[] } -> { estados: EstadoAoVivo[] }. Refaz o fetch de cada lote na fonte. */
export async function POST(req: Request) {
  const t = await tServer();
  if (!origemOk(req)) return NextResponse.json({ erro: t("Origem não permitida.") }, { status: 403 });
  const sb = await supabaseServer();
  if (!sb) return NextResponse.json({ erro: t("Autenticação indisponível neste servidor.") }, { status: 500 });
  const { data } = await sb.auth.getUser();
  if (!data.user) return NextResponse.json({ erro: t("Entre na sua conta.") }, { status: 401 });
  const limite = await permitir(`verificar:${data.user.id}`, POR_HORA, 60 * 60);
  if (!limite.ok) return NextResponse.json({ erro: t("Limite de {n} verificações por hora atingido. Tente daqui a pouco.", { n: POR_HORA }) }, { status: 429 });

  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: t("Corpo inválido: esperado JSON { ids: string[] }.") }, { status: 400 });
  }
  const brutos = (corpo as { ids?: unknown })?.ids;
  if (!Array.isArray(brutos)) return NextResponse.json({ erro: t("Informe ids: string[].") }, { status: 400 });

  const ids = [...new Set(brutos.filter((x): x is string => typeof x === "string" && !!x))];
  if (!ids.length) return NextResponse.json({ estados: [] as EstadoAoVivo[] });
  if (ids.length > MAX) return NextResponse.json({ erro: t("No máximo {max} lotes por vez.", { max: MAX }) }, { status: 400 });

  const lotes = await porIds(ids, true);
  const naoAchados = ids.filter((id) => !lotes.some((l) => l.id === id));

  const estados = await verificarLotes(lotes, 4, t);
  for (const id of naoAchados) {
    estados.push({
      loteId: id,
      fonte: "",
      verificadoEm: new Date().toISOString(),
      ok: false,
      situacao: "desconhecido",
      mudancas: [],
      erro: t("Lote não está no catálogo atual."),
    });
  }
  return NextResponse.json({ estados });
}
