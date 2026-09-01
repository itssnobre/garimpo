import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Cliente por requisição (Route Handlers e Server Components). Server Components não gravam cookie: o proxy.ts cuida do refresh. */
export async function supabaseServer() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, chave = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !chave) return null;
  const jar = await cookies();
  return createServerClient(url, chave, { cookies: {
    getAll() { return jar.getAll(); },
    setAll(lista) { try { lista.forEach(({ name, value, options }) => jar.set(name, value, options)); } catch {} },
  } });
}
