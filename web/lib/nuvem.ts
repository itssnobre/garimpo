"use client";
// Utilitários dos hooks sincronizados: a nuvem (Supabase) é a fonte da verdade da conta; o localStorage é só cache
// POR CONTA (chave com o id do usuário), para nunca vazar dados de uma conta para outra no mesmo navegador.
export const ler = <T,>(k: string, fallback: T): T => { try { const s = localStorage.getItem(k); return s ? (JSON.parse(s) as T) : fallback; } catch { return fallback; } };
export const gravar = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
/** Chave de cache da conta: `garimpo:favoritos:<uid>`. Sem conta, a chave fica sem sufixo (uso só neste navegador). */
export const chaveDe = (base: string, uid?: string) => (uid ? `${base}:${uid}` : base);
/** Escrita remota em segundo plano: a UI não espera nem quebra se a rede falhar. */
export const emSegundoPlano = (p: PromiseLike<unknown>) => { Promise.resolve(p).catch(() => {}); };
