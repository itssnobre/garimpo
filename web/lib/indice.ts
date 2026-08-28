"use client";
// Índice por UF carregado sob demanda de /dados/uf/<UF>.json (gerado pelo build.py).
import { useEffect, useMemo, useState } from "react";
import type { Imovel } from "./types";
import { UFS_DISPONIVEIS } from "./meta";

const cache = new Map<string, Promise<Imovel[]>>();
export function carregarUF(uf: string): Promise<Imovel[]> {
  if (!cache.has(uf)) cache.set(uf, fetch(`/dados/uf/${uf}.json`).then((r) => (r.ok ? r.json() : [])).catch(() => []));
  return cache.get(uf)!;
}

const K = "lotwise:ufs";
export function lerUFsSalvas(): string[] | null { try { const s = localStorage.getItem(K); return s ? JSON.parse(s) : null; } catch { return null; } }
export function salvarUFs(ufs: string[]) { try { localStorage.setItem(K, JSON.stringify(ufs)); } catch {} }

/** `ufs` vazio = Brasil inteiro. Devolve os lotes das UFs pedidas e o estado de carga. */
export function useIndice(ufs: string[]) {
  const alvo = useMemo(() => (ufs.length ? ufs : UFS_DISPONIVEIS), [ufs]);
  const chave = alvo.join(",");
  const [estado, setEstado] = useState<{ chave: string; imoveis: Imovel[] }>({ chave: "", imoveis: [] });
  useEffect(() => {
    let vivo = true;
    Promise.all(alvo.map(carregarUF)).then((ls) => { if (vivo) setEstado({ chave, imoveis: ls.flat() }); });
    return () => { vivo = false; };
  }, [chave, alvo]);
  return { imoveis: estado.imoveis, carregando: estado.chave !== chave };
}

/** Lotes por id (favoritos, pipeline, carteira): servidor devolve do JSON completo. */
export function useLotes(ids: string[]) {
  const chave = [...ids].sort().join(",");
  const [estado, setEstado] = useState<{ chave: string; imoveis: Imovel[] }>({ chave: "", imoveis: [] });
  useEffect(() => {
    if (!chave) { setEstado({ chave, imoveis: [] }); return; }
    let vivo = true;
    fetch(`/api/lotes?ids=${encodeURIComponent(chave)}`).then((r) => (r.ok ? r.json() : [])).catch(() => [])
      .then((l: Imovel[]) => { if (vivo) setEstado({ chave, imoveis: l }); });
    return () => { vivo = false; };
  }, [chave]);
  return { imoveis: estado.imoveis, carregando: estado.chave !== chave };
}
