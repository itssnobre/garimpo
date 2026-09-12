"use client";
// Lotes por id (favoritos, pipeline, acompanhar) e a lembrança de quais estados o usuário escolheu.
// O catálogo em si não passa mais por aqui: a busca consulta o banco em lib/busca.ts.
import { useEffect, useState } from "react";
import type { Imovel } from "./types";

const K = "lotwise:ufs";
export function lerUFsSalvas(): string[] | null { try { const s = localStorage.getItem(K); return s ? JSON.parse(s) : null; } catch { return null; } }
export function salvarUFs(ufs: string[]) { try { localStorage.setItem(K, JSON.stringify(ufs)); } catch {} }

/** Lotes por id: o servidor devolve o dado completo do banco. */
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
