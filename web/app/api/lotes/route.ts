import { NextResponse } from "next/server";
import { byId } from "@/lib/dadosCompletos";
export const dynamic = "force-dynamic";
// Teto de ids por chamada: sem ele, uma URL só varre o catálogo inteiro.
export function GET(req: Request) {
  const ids = (new URL(req.url).searchParams.get("ids") ?? "").split(",").filter(Boolean).slice(0, 60);
  return NextResponse.json(ids.map(byId).filter(Boolean));
}
