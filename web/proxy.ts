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
  await sb.auth.getClaims();
  return res;
}

export const config = { matcher: ["/app/:path*", "/entrar", "/auth/:path*", "/api/:path*"] };
