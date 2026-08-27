"use client";
import { useEffect, useState } from "react";
export const ETAPAS = ["Analisando", "Diligência", "Lance definido", "Arrematado", "Descartado"] as const;
export type Etapa = (typeof ETAPAS)[number];
export interface Item { etapa: Etapa; lanceMax?: number; lanceFinal?: number; nota?: string; em: string }
const K = "garimpo:pipeline";
export function usePipeline() {
  const [pipe, setPipe] = useState<Record<string, Item>>({});
  useEffect(() => { try { const s = localStorage.getItem(K); if (s) setPipe(JSON.parse(s)); } catch {} }, []);
  const salvar = (n: Record<string, Item>) => { setPipe(n); try { localStorage.setItem(K, JSON.stringify(n)); } catch {} };
  const mover = (id: string, etapa: Etapa, extra: Partial<Item> = {}) => salvar({ ...pipe, [id]: { ...(pipe[id] ?? { em: new Date().toISOString() }), ...extra, etapa } });
  const tirar = (id: string) => { const n = { ...pipe }; delete n[id]; salvar(n); };
  return { pipe, mover, tirar };
}
