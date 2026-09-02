"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { nuvemConfigurada, supabaseBrowser } from "./supabase/client";

export interface Perfil { nome: string; papel: "admin" | "cliente" }
interface Conta { user: User | null; perfil: Perfil | null; pronto: boolean; sb: SupabaseClient | null; nuvem: boolean; sair: () => Promise<void>; recarregarPerfil: () => Promise<void> }
const Ctx = createContext<Conta>({ user: null, perfil: null, pronto: true, sb: null, nuvem: false, sair: async () => {}, recarregarPerfil: async () => {} });

/** Sessão do usuário + perfil (nome, papel). Fora do provider (landing) devolve "sem conta". */
export function ContaProvider({ children }: { children: React.ReactNode }) {
  const sb = useMemo(() => supabaseBrowser(), []);
  const [user, setUser] = useState<User | null>(null); const [perfil, setPerfil] = useState<Perfil | null>(null); const [pronto, setPronto] = useState(!sb);
  // Perfil é criado na primeira entrada (não há trigger em auth.users: o projeto Supabase é compartilhado com outros apps).
  const carregarPerfil = useCallback(async (u: User | null) => {
    if (!sb || !u) { setPerfil(null); return; }
    const { data } = await sb.from("lotwise_perfis").select("nome,papel").eq("user_id", u.id).maybeSingle();
    if (data) { setPerfil(data as Perfil); return; }
    const nome = (u.user_metadata?.nome as string | undefined) ?? "";
    const { data: novo } = await sb.from("lotwise_perfis").insert({ user_id: u.id, nome }).select("nome,papel").maybeSingle();
    setPerfil((novo as Perfil | null) ?? { nome, papel: "cliente" });
  }, [sb]);
  useEffect(() => {
    if (!sb) return;
    sb.auth.getUser().then(async ({ data }) => { setUser(data.user); await carregarPerfil(data.user); setPronto(true); });
    const { data: sub } = sb.auth.onAuthStateChange((ev, s) => { const u = s?.user ?? null; setUser(u); if (ev === "SIGNED_IN" || ev === "SIGNED_OUT" || ev === "USER_UPDATED") carregarPerfil(u); });
    return () => sub.subscription.unsubscribe();
  }, [sb, carregarPerfil]);
  const sair = async () => { await sb?.auth.signOut(); setUser(null); setPerfil(null); };
  const recarregarPerfil = useCallback(() => carregarPerfil(user), [carregarPerfil, user]);
  return <Ctx.Provider value={{ user, perfil, pronto, sb, nuvem: nuvemConfigurada(), sair, recarregarPerfil }}>{children}</Ctx.Provider>;
}
export const useConta = () => useContext(Ctx);
