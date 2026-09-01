"use client";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { nuvemConfigurada, supabaseBrowser } from "./supabase/client";

interface Conta { user: User | null; pronto: boolean; sb: SupabaseClient | null; nuvem: boolean; sair: () => Promise<void> }
const Ctx = createContext<Conta>({ user: null, pronto: true, sb: null, nuvem: false, sair: async () => {} });

/** Sessão do usuário. Fora do provider (landing) devolve "sem conta", e os hooks caem no localStorage. */
export function ContaProvider({ children }: { children: React.ReactNode }) {
  const sb = useMemo(() => supabaseBrowser(), []);
  const [user, setUser] = useState<User | null>(null); const [pronto, setPronto] = useState(!sb);
  useEffect(() => {
    if (!sb) return;
    sb.auth.getUser().then(({ data }) => { setUser(data.user); setPronto(true); });
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => setUser(s?.user ?? null));
    return () => sub.subscription.unsubscribe();
  }, [sb]);
  const sair = async () => { await sb?.auth.signOut(); setUser(null); };
  return <Ctx.Provider value={{ user, pronto, sb, nuvem: nuvemConfigurada(), sair }}>{children}</Ctx.Provider>;
}
export const useConta = () => useContext(Ctx);
