"use client";
import { useEffect, useState } from "react";
import { useConta } from "./conta";
import { emSegundoPlano, gravar, ler } from "./nuvem";
const K = "garimpo:favoritos", T = "lotwise_favoritos";
export function useFavoritos() {
  const { user, sb } = useConta(); const uid = user?.id;
  const [favs, setFavs] = useState<Set<string>>(new Set());
  useEffect(() => { setFavs(new Set(ler<string[]>(K, []))); }, []);
  // Logado: junta a nuvem com este navegador e sobe o que só existia aqui (migra os dados antigos sozinho).
  useEffect(() => {
    if (!uid || !sb) return; let vivo = true;
    sb.from(T).select("lote_id").then(({ data }) => {
      if (!vivo || !data) return;
      const remoto = new Set(data.map((d) => d.lote_id as string));
      setFavs((f) => { const faltam = [...f].filter((x) => !remoto.has(x)); if (faltam.length) emSegundoPlano(sb.from(T).upsert(faltam.map((lote_id) => ({ lote_id })))); const n = new Set([...f, ...remoto]); gravar(K, [...n]); return n; });
    });
    return () => { vivo = false; };
  }, [uid, sb]);
  const toggle = (id: string) => setFavs((f) => {
    const n = new Set(f); const tinha = n.has(id); if (tinha) n.delete(id); else n.add(id); gravar(K, [...n]);
    if (uid && sb) emSegundoPlano(tinha ? sb.from(T).delete().eq("lote_id", id) : sb.from(T).upsert({ lote_id: id }));
    return n;
  });
  return { favs, toggle };
}
