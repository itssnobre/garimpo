"use client";
// Utilitários dos hooks sincronizados: localStorage é o cache imediato, a nuvem (Supabase) é a cópia entre aparelhos.
export const ler = <T,>(k: string, fallback: T): T => { try { const s = localStorage.getItem(k); return s ? (JSON.parse(s) as T) : fallback; } catch { return fallback; } };
export const gravar = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
/** Escrita remota em segundo plano: a UI não espera nem quebra se a rede falhar. */
export const emSegundoPlano = (p: PromiseLike<unknown>) => { Promise.resolve(p).catch(() => {}); };
