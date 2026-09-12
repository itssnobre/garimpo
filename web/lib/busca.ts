"use client";
// Busca paginada no servidor. Antes a tela baixava o catálogo do estado inteiro (São Paulo passava
// de 6 MB) e filtrava no navegador; agora o banco filtra e devolve uma página por vez.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Imovel } from "./types";
import type { Regras } from "./motor";

export type Ordem = "score" | "margem" | "desagio" | "lance" | "data";

export type FiltrosTela = {
  ufs?: string[]; cidade?: string; tipo?: string; fonte?: string; modalidade?: string; busca?: string;
  precoMin?: number; precoMax?: number; quartosMin?: number; areaMin?: number; areaMax?: number;
  soFoto?: boolean; ids?: string[];
  ocultarVeto?: boolean; ocultarEncerrados?: boolean; soComData?: boolean; ocultarSuspeitos?: boolean;
};

export type Pedido = { filtros: FiltrosTela; padrao: Regras | null; soPassam: boolean; ordem: Ordem; quantos?: number };

type Resposta = { itens: Imovel[]; total: number; mostrando: number; cortado: boolean; amostra: boolean };

const ESPERA = 320; // ms: dá tempo de terminar de digitar antes de consultar

export function useBusca(p: Pedido) {
  const chave = JSON.stringify(p);
  const [itens, setItens] = useState<Imovel[]>([]);
  const [total, setTotal] = useState(0);
  const [amostra, setAmostra] = useState(false);
  const [cortado, setCortado] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const atual = useRef(chave);

  const pedir = useCallback(async (inicio: number): Promise<Resposta | null> => {
    const r = await fetch("/api/busca", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...p, inicio, quantos: p.quantos ?? 48 }),
    }).catch(() => null);
    if (!r?.ok) return null;
    return (await r.json().catch(() => null)) as Resposta | null;
  // A chave já representa o pedido inteiro; usar o objeto direto recriaria a função a cada render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);

  useEffect(() => {
    atual.current = chave;
    setCarregando(true);
    const id = setTimeout(async () => {
      const r = await pedir(0);
      if (atual.current !== chave) return; // filtro mudou no meio: resposta velha é descartada
      setItens(r?.itens ?? []); setTotal(r?.total ?? 0);
      setAmostra(Boolean(r?.amostra)); setCortado(Boolean(r?.cortado));
      setCarregando(false);
    }, ESPERA);
    return () => clearTimeout(id);
  }, [chave, pedir]);

  const mais = useCallback(async () => {
    if (carregandoMais) return;
    setCarregandoMais(true);
    const r = await pedir(itens.length);
    if (atual.current === chave && r) setItens((l) => [...l, ...r.itens]);
    setCarregandoMais(false);
  }, [carregandoMais, itens.length, pedir, chave]);

  return { itens, total, carregando, carregandoMais, amostra, cortado, mais, temMais: !amostra && itens.length < total };
}

export type Previa = { passam: number; alvo: number; melhor: number; base: number; cortado: boolean };

/** Prévia do editor de padrão: o servidor conta e pontua, a tela só mostra. */
export function usePrevia(padrao: Regras) {
  const chave = JSON.stringify(padrao);
  const [previa, setPrevia] = useState<Previa>({ passam: 0, alvo: 0, melhor: 0, base: 0, cortado: false });
  useEffect(() => {
    let vivo = true;
    const id = setTimeout(async () => {
      const r = await fetch("/api/busca", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filtros: { ufs: padrao.ufs }, padrao, soPassam: true, previa: true }),
      }).catch(() => null);
      const d = r?.ok ? ((await r.json().catch(() => null)) as Previa | null) : null;
      if (vivo && d) setPrevia(d);
    }, ESPERA);
    return () => { vivo = false; clearTimeout(id); };
  // A chave já é o padrão inteiro serializado.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);
  return previa;
}
