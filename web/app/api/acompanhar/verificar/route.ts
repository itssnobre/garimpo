import { NextResponse } from "next/server";
import { byId } from "@/lib/dadosCompletos";
import { supabaseServer } from "@/lib/supabase/server";
import { verificarLotes, type EstadoAoVivo } from "@/lib/aovivo";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const MAX = 30;

/** POST { ids: string[] } -> { estados: EstadoAoVivo[] }. Refaz o fetch de cada lote na fonte. */
export async function POST(req: Request) {
  const sb = await supabaseServer();
  if (!sb) return NextResponse.json({ erro: "Autenticação indisponível neste servidor." }, { status: 500 });
  const { data } = await sb.auth.getUser();
  if (!data.user) return NextResponse.json({ erro: "Entre na sua conta." }, { status: 401 });

  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Corpo inválido: esperado JSON { ids: string[] }." }, { status: 400 });
  }
  const brutos = (corpo as { ids?: unknown })?.ids;
  if (!Array.isArray(brutos)) return NextResponse.json({ erro: "Informe ids: string[]." }, { status: 400 });

  const ids = [...new Set(brutos.filter((x): x is string => typeof x === "string" && !!x))];
  if (!ids.length) return NextResponse.json({ estados: [] as EstadoAoVivo[] });
  if (ids.length > MAX) return NextResponse.json({ erro: `No máximo ${MAX} lotes por vez.` }, { status: 400 });

  const lotes = ids.map(byId).filter((x): x is NonNullable<typeof x> => !!x);
  const naoAchados = ids.filter((id) => !lotes.some((l) => l.id === id));

  const estados = await verificarLotes(lotes, 4);
  for (const id of naoAchados) {
    estados.push({
      loteId: id,
      fonte: "",
      verificadoEm: new Date().toISOString(),
      ok: false,
      situacao: "desconhecido",
      mudancas: [],
      erro: "Lote não está no catálogo atual.",
    });
  }
  return NextResponse.json({ estados });
}
