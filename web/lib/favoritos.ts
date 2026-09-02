"use client";
import { useEffect, useState } from "react";
import { useConta } from "./conta";
import { chaveDe, emSegundoPlano, gravar, ler } from "./nuvem";
const K = "garimpo:favoritos", T = "lotwise_favoritos";
export function useFavoritos() {
  const { user, sb, pronto } = useConta(); const uid = user?.id; const k = chaveDe(K, uid);
  const [favs, setFavs] = useState<Set<string>>(new Set());
  // Cache da conta primeiro (abre instantâneo), depois a nuvem manda.
  useEffect(() => { if (!pronto) return; setFavs(new Set(ler<string[]>(k, []))); }, [k, pronto]);
  useEffect(() => {
    if (!uid || !sb) return; let vivo = true;
    sb.from(T).select("lote_id").then(({ data }) => { if (!vivo || !data) return; const n = new Set(data.map((d) => d.lote_id as string)); setFavs(n); gravar(k, [...n]); });
    return () => { vivo = false; };
  }, [uid, sb, k]);
  const toggle = (id: string) => setFavs((f) => {
    const n = new Set(f); const tinha = n.has(id); if (tinha) n.delete(id); else n.add(id); gravar(k, [...n]);
    if (uid && sb) emSegundoPlano(tinha ? sb.from(T).delete().eq("lote_id", id) : sb.from(T).upsert({ lote_id: id }));
    return n;
  });
  return { favs, toggle };
}
