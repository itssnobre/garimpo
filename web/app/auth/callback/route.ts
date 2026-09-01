import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase/server";

// Destino dos links de e-mail (confirmação, link mágico, recuperação): troca o código pela sessão e manda pro app.
export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code"), token_hash = searchParams.get("token_hash"), type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/app/buscar";
  const destino = `${origin}${next.startsWith("/") ? next : "/app/buscar"}`;
  const sb = await supabaseServer();
  if (sb) {
    if (code) { const { error } = await sb.auth.exchangeCodeForSession(code); if (!error) return NextResponse.redirect(destino); }
    else if (token_hash && type) { const { error } = await sb.auth.verifyOtp({ token_hash, type }); if (!error) return NextResponse.redirect(destino); }
  }
  return NextResponse.redirect(`${origin}/entrar?erro=link`);
}
