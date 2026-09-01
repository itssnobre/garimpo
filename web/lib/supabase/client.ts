"use client";
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", CHAVE = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
/** Sem as duas variáveis o app roda igual, só sem conta (tudo fica no navegador). */
export const nuvemConfigurada = () => Boolean(URL && CHAVE);
let cli: SupabaseClient | null = null;
export function supabaseBrowser(): SupabaseClient | null { if (!nuvemConfigurada()) return null; return (cli ??= createBrowserClient(URL, CHAVE)); }
