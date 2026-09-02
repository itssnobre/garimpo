import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseServer } from "./server";

/** Cliente com a chave de serviço (só no servidor): ignora RLS e administra usuários. Nunca vai pro navegador. */
export function supabaseAdmin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) return null;
  return createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } });
}

export type Papel = "admin" | "cliente";
/** Quem está chamando (pela sessão em cookie) e o papel dele. */
export async function quemChama(): Promise<{ id: string; email: string; papel: Papel } | null> {
  const sb = await supabaseServer(); if (!sb) return null;
  const { data } = await sb.auth.getUser(); if (!data.user) return null;
  const admin = supabaseAdmin();
  const { data: p } = await (admin ?? sb).from("lotwise_perfis").select("papel").eq("user_id", data.user.id).maybeSingle();
  return { id: data.user.id, email: data.user.email ?? "", papel: ((p?.papel as Papel | undefined) ?? "cliente") };
}
export async function exigirAdmin() {
  const q = await quemChama();
  if (!q) return { erro: "Entre na sua conta.", status: 401 as const };
  if (q.papel !== "admin") return { erro: "Só administradores.", status: 403 as const };
  const admin = supabaseAdmin();
  if (!admin) return { erro: "Falta SUPABASE_SERVICE_ROLE_KEY no servidor.", status: 500 as const };
  return { quem: q, admin };
}
