"use client";
import { useEffect, useState } from "react";
import { novoPadrao, type Padrao } from "./padrao";
import { useConta } from "./conta";
import { emSegundoPlano, gravar, ler } from "./nuvem";
const K = "garimpo:padroes", KA = "garimpo:padrao-ativo", T = "lotwise_padroes";
const lerAtivo = () => { try { return localStorage.getItem(KA) || ""; } catch { return ""; } };
export function usePadroes() {
  const { user, sb } = useConta(); const uid = user?.id;
  const [lista, setLista] = useState<Padrao[]>([]); const [ativoId, setAtivoId] = useState<string>(""); const [pronto, setPronto] = useState(false);
  useEffect(() => { const l = ler<Padrao[]>(K, []); setLista(l); setAtivoId(lerAtivo() || l[0]?.id || ""); setPronto(true); }, []);
  // Logado: padrões da nuvem mandam; os que só existem neste navegador sobem.
  useEffect(() => {
    if (!uid || !sb) return; let vivo = true;
    sb.from(T).select("id,dados,ativo").then(({ data }) => {
      if (!vivo || !data) return;
      const remotos = data.map((d) => ({ ...(d.dados as Padrao), id: d.id as string })); const ids = new Set(remotos.map((p) => p.id));
      const faltam = ler<Padrao[]>(K, []).filter((p) => !ids.has(p.id)); const l = [...remotos, ...faltam];
      const a = (data.find((d) => d.ativo)?.id as string | undefined) ?? lerAtivo() ?? l[0]?.id ?? "";
      if (faltam.length) emSegundoPlano(sb.from(T).upsert(faltam.map((p) => ({ id: p.id, dados: p, ativo: p.id === a }))));
      setLista(l); setAtivoId(a); gravar(K, l); try { localStorage.setItem(KA, a); } catch {}
    });
    return () => { vivo = false; };
  }, [uid, sb]);
  const persistir = (l: Padrao[], a: string) => { setLista(l); setAtivoId(a); gravar(K, l); try { localStorage.setItem(KA, a); } catch {} };
  const marcarAtivo = (a: string) => { if (uid && sb) emSegundoPlano(sb.from(T).update({ ativo: false }).neq("id", a).then(() => sb.from(T).update({ ativo: true }).eq("id", a))); };
  const salvar = (p: Padrao) => { const l = lista.some((x) => x.id === p.id) ? lista.map((x) => (x.id === p.id ? p : x)) : [...lista, p]; persistir(l, p.id); if (uid && sb) emSegundoPlano(sb.from(T).upsert({ id: p.id, dados: p, ativo: true }).then(() => sb.from(T).update({ ativo: false }).neq("id", p.id))); };
  const remover = (id: string) => { const l = lista.filter((x) => x.id !== id); const a = l[0]?.id ?? ""; persistir(l, a); if (uid && sb) emSegundoPlano(sb.from(T).delete().eq("id", id)); if (a) marcarAtivo(a); };
  const ativar = (id: string) => { persistir(lista, id); marcarAtivo(id); };
  const ativo = lista.find((x) => x.id === ativoId) ?? null;
  return { lista, ativo, ativoId, pronto, salvar, remover, ativar, novo: novoPadrao };
}
