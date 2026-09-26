import { NextResponse } from "next/server";
import { porIds } from "@/lib/catalogo";
import { supabaseServer } from "@/lib/supabase/server";
import { ipDe, permitir } from "@/lib/limite";
import { tServer } from "@/lib/i18n/server";
export const dynamic = "force-dynamic";
// Rota pública que devolve o lote completo: visitante sem conta tem teto por IP.
const VISITANTE_POR_HORA = 600;
// Teto de ids por chamada: sem ele, uma URL só varre o catálogo inteiro.
export async function GET(req: Request) {
  const sb = await supabaseServer();
  const usuario = sb ? (await sb.auth.getUser()).data.user : null;
  if (!usuario && !(await permitir(`lotes-ip:${ipDe(req)}`, VISITANTE_POR_HORA, 60 * 60)).ok) {
    const t = await tServer();
    return NextResponse.json({ erro: t("Muitas buscas seguidas. Entre na sua conta ou tente daqui a pouco.") }, { status: 429 });
  }
  const ids = (new URL(req.url).searchParams.get("ids") ?? "").split(",").filter(Boolean).slice(0, 60);
  return NextResponse.json(await porIds(ids, true));
}
