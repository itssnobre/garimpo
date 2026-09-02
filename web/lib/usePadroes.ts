"use client";
import { useEffect, useState } from "react";
import { novoPadrao, type Padrao } from "./padrao";
import { useConta } from "./conta";
import { chaveDe, emSegundoPlano, gravar, ler } from "./nuvem";
const K = "garimpo:padroes", KA = "garimpo:padrao-ativo", T = "lotwise_padroes";
export function usePadroes() {
  const { user, sb, nuvem, pronto: contaPronta } = useConta(); const uid = user?.id;
  const k = chaveDe(K, uid), ka = chaveDe(KA, uid);
  const lerAtivo = () => { try { return localStorage.getItem(ka) || ""; } catch { return ""; } };
  const [lista, setLista] = useState<Padrao[]>([]); const [ativoId, setAtivoId] = useState<string>(""); const [pronto, setPronto] = useState(false);
  // Visitante não tem padrão (a conta é a dona das regras); sem nuvem configurada, vale o navegador.
  // Logado: cache da conta abre na hora e a nuvem confirma em seguida ("pronto" só depois da nuvem).
  useEffect(() => {
    if (!contaPronta) return;
    if (nuvem && !uid) { setLista([]); setAtivoId(""); setPronto(true); return; }
    const l = ler<Padrao[]>(k, []); setLista(l); setAtivoId(lerAtivo() || l[0]?.id || ""); if (!uid) setPronto(true);
  }, [contaPronta, nuvem, uid, k]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!uid || !sb) return; let vivo = true;
    sb.from(T).select("id,dados,ativo").then(({ data }) => {
      if (!vivo || !data) return;
      const l = data.map((d) => ({ ...(d.dados as Padrao), id: d.id as string }));
      // Nenhum padrão marcado como ativo = nenhum selecionado (o usuário escolhe).
      const a = (data.find((d) => d.ativo)?.id as string | undefined) ?? "";
      setLista(l); setAtivoId(a); gravar(k, l); try { localStorage.setItem(ka, a); } catch {}
      setPronto(true);
    });
    return () => { vivo = false; };
  }, [uid, sb, k, ka]);
  const persistir = (l: Padrao[], a: string) => { setLista(l); setAtivoId(a); gravar(k, l); try { localStorage.setItem(ka, a); } catch {} };
  const marcarAtivo = (a: string) => { if (uid && sb) emSegundoPlano(sb.from(T).update({ ativo: false }).neq("id", a).then(() => sb.from(T).update({ ativo: true }).eq("id", a))); };
  const salvar = (p: Padrao) => { const l = lista.some((x) => x.id === p.id) ? lista.map((x) => (x.id === p.id ? p : x)) : [...lista, p]; persistir(l, p.id); if (uid && sb) emSegundoPlano(sb.from(T).upsert({ id: p.id, dados: p, ativo: true }).then(() => sb.from(T).update({ ativo: false }).neq("id", p.id))); };
  const remover = (id: string) => { const l = lista.filter((x) => x.id !== id); const a = l[0]?.id ?? ""; persistir(l, a); if (uid && sb) emSegundoPlano(sb.from(T).delete().eq("id", id)); if (a) marcarAtivo(a); };
  const ativar = (id: string) => { persistir(lista, id); marcarAtivo(id); };
  const desativar = () => { persistir(lista, ""); if (uid && sb) emSegundoPlano(sb.from(T).update({ ativo: false }).neq("id", "")); };
  const ativo = lista.find((x) => x.id === ativoId) ?? null;
  return { lista, ativo, ativoId, pronto, salvar, remover, ativar, desativar, novo: novoPadrao };
}
