import { NextResponse } from "next/server";
import { porIds } from "@/lib/catalogo";
export const dynamic = "force-dynamic";
// Teto de ids por chamada: sem ele, uma URL só varre o catálogo inteiro.
export async function GET(req: Request) {
  const ids = (new URL(req.url).searchParams.get("ids") ?? "").split(",").filter(Boolean).slice(0, 60);
  return NextResponse.json(await porIds(ids, true));
}
