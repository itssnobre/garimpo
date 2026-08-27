"use client";
import { useEffect, useState } from "react";
import { novoPadrao, type Padrao } from "./padrao";
const K = "garimpo:padroes", KA = "garimpo:padrao-ativo";
export function usePadroes() {
  const [lista, setLista] = useState<Padrao[]>([]); const [ativoId, setAtivoId] = useState<string>(""); const [pronto, setPronto] = useState(false);
  useEffect(() => { try { const s = localStorage.getItem(K); const l: Padrao[] = s ? JSON.parse(s) : []; setLista(l); setAtivoId(localStorage.getItem(KA) || l[0]?.id || ""); } catch {} setPronto(true); }, []);
  const persistir = (l: Padrao[], a: string) => { setLista(l); setAtivoId(a); try { localStorage.setItem(K, JSON.stringify(l)); localStorage.setItem(KA, a); } catch {} };
  const salvar = (p: Padrao) => { const l = lista.some((x) => x.id === p.id) ? lista.map((x) => (x.id === p.id ? p : x)) : [...lista, p]; persistir(l, p.id); };
  const remover = (id: string) => { const l = lista.filter((x) => x.id !== id); persistir(l, l[0]?.id ?? ""); };
  const ativar = (id: string) => persistir(lista, id);
  const ativo = lista.find((x) => x.id === ativoId) ?? null;
  return { lista, ativo, ativoId, pronto, salvar, remover, ativar, novo: novoPadrao };
}
