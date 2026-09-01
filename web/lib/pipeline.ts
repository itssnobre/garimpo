"use client";
import { useEffect, useState } from "react";
import { useConta } from "./conta";
import { emSegundoPlano, gravar, ler } from "./nuvem";
export const ETAPAS = ["Analisando", "Diligência", "Lance definido", "Arrematado", "Descartado"] as const;
export type Etapa = (typeof ETAPAS)[number];
export interface Item { etapa: Etapa; lanceMax?: number; lanceFinal?: number; nota?: string; em: string }
const K = "garimpo:pipeline", T = "lotwise_pipeline";
export function usePipeline() {
  const { user, sb } = useConta(); const uid = user?.id;
  const [pipe, setPipe] = useState<Record<string, Item>>({});
  useEffect(() => { setPipe(ler<Record<string, Item>>(K, {})); }, []);
  // Logado: o que está na nuvem vence; lotes que só existem aqui sobem.
  useEffect(() => {
    if (!uid || !sb) return; let vivo = true;
    sb.from(T).select("lote_id,dados").then(({ data }) => {
      if (!vivo || !data) return;
      const remoto = Object.fromEntries(data.map((d) => [d.lote_id as string, d.dados as Item]));
      const local = ler<Record<string, Item>>(K, {}); const faltam = Object.keys(local).filter((id) => !remoto[id]);
      if (faltam.length) emSegundoPlano(sb.from(T).upsert(faltam.map((lote_id) => ({ lote_id, dados: local[lote_id] }))));
      const n = { ...local, ...remoto }; setPipe(n); gravar(K, n);
    });
    return () => { vivo = false; };
  }, [uid, sb]);
  const salvar = (n: Record<string, Item>) => { setPipe(n); gravar(K, n); };
  const mover = (id: string, etapa: Etapa, extra: Partial<Item> = {}) => { const item = { ...(pipe[id] ?? { em: new Date().toISOString() }), ...extra, etapa }; salvar({ ...pipe, [id]: item }); if (uid && sb) emSegundoPlano(sb.from(T).upsert({ lote_id: id, dados: item })); };
  const tirar = (id: string) => { const n = { ...pipe }; delete n[id]; salvar(n); if (uid && sb) emSegundoPlano(sb.from(T).delete().eq("lote_id", id)); };
  return { pipe, mover, tirar };
}
