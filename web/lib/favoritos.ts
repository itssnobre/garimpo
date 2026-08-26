"use client";
import { useEffect, useState } from "react";
const K = "garimpo:favoritos";
export function useFavoritos() {
  const [favs, setFavs] = useState<Set<string>>(new Set());
  useEffect(() => { try { const s = localStorage.getItem(K); if (s) setFavs(new Set(JSON.parse(s))); } catch {} }, []);
  const toggle = (id: string) => setFavs((f) => { const n = new Set(f); n.has(id) ? n.delete(id) : n.add(id); try { localStorage.setItem(K, JSON.stringify([...n])); } catch {} return n; });
  return { favs, toggle };
}
