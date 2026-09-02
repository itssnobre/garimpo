import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Renova o token de sessão do Supabase a cada requisição do app e repassa o cookie novo pro navegador e pros Server Components.
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, chave = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  let res = NextResponse.next({ request });
  if (!url || !chave) return res;
  const sb = createServerClient(url, chave, { cookies: {
    getAll: () => request.cookies.getAll(),
    setAll(lista, headers) {
      lista.forEach(({ name, value }) => request.cookies.set(name, value));
      res = NextResponse.next({ request });
      lista.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      if (headers) Object.entries(headers).forEach(([k, v]) => { if (typeof v === "string") res.headers.set(k, v); });
    },
  } });
  const { data } = await sb.auth.getClaims();
  const logado = Boolean(data?.claims);
  const { pathname, search } = request.nextUrl;
  // Áreas que exigem conta: sem sessão, API responde 401 e página vai pro login (o Portao no cliente cobre o resto).
  if (!logado) {
    if (API_PRIVADA.some((p) => pathname.startsWith(p))) return NextResponse.json({ erro: "Entre na sua conta." }, { status: 401 });
    if (PRIVADAS.some((p) => pathname.startsWith(p))) return NextResponse.redirect(new URL(`/entrar?next=${encodeURIComponent(pathname + search)}`, request.url));
  }
  return res;
}
const PRIVADAS = ["/app/sugeridos", "/app/sage", "/app/pipeline", "/app/carteira", "/app/favoritos", "/app/padrao", "/app/calculadora", "/app/admin"];
const API_PRIVADA = ["/api/sage", "/api/matricula", "/api/admin", "/api/conta"];

export const config = { matcher: ["/app/:path*", "/entrar", "/auth/:path*", "/api/:path*"] };
