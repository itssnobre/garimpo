import { NextResponse } from "next/server";
import { byId } from "@/lib/dadosCompletos";
export const dynamic = "force-dynamic";
export function GET(req: Request) {
  const ids = (new URL(req.url).searchParams.get("ids") ?? "").split(",").filter(Boolean).slice(0, 500);
  return NextResponse.json(ids.map(byId).filter(Boolean));
}
