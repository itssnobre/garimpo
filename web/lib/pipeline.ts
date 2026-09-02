"use client";
import { useEffect, useState } from "react";
import { useConta } from "./conta";
import { chaveDe, emSegundoPlano, gravar, ler } from "./nuvem";
export const ETAPAS = ["Analisando", "Diligência", "Lance definido", "Arrematado", "Descartado"] as const;
export type Etapa = (typeof ETAPAS)[number];
export interface Item { etapa: Etapa; lanceMax?: number; lanceFinal?: number; nota?: string; em: string }
const K = "garimpo:pipeline", T = "lotwise_pipeline";
export function usePipeline() {
  const { user, sb, pronto } = useConta(); const uid = user?.id; const k = chaveDe(K, uid);
  const [pipe, setPipe] = useState<Record<string, Item>>({});
  useEffect(() => { if (!pronto) return; setPipe(ler<Record<string, Item>>(k, {})); }, [k, pronto]);
  // Logado: a nuvem é a fonte da verdade.
  useEffect(() => {
    if (!uid || !sb) return; let vivo = true;
    sb.from(T).select("lote_id,dados").then(({ data }) => { if (!vivo || !data) return; const n = Object.fromEntries(data.map((d) => [d.lote_id as string, d.dados as Item])); setPipe(n); gravar(k, n); });
    return () => { vivo = false; };
  }, [uid, sb, k]);
  const salvar = (n: Record<string, Item>) => { setPipe(n); gravar(k, n); };
  const mover = (id: string, etapa: Etapa, extra: Partial<Item> = {}) => { const item = { ...(pipe[id] ?? { em: new Date().toISOString() }), ...extra, etapa }; salvar({ ...pipe, [id]: item }); if (uid && sb) emSegundoPlano(sb.from(T).upsert({ lote_id: id, dados: item })); };
  const tirar = (id: string) => { const n = { ...pipe }; delete n[id]; salvar(n); if (uid && sb) emSegundoPlano(sb.from(T).delete().eq("lote_id", id)); };
  return { pipe, mover, tirar };
}
