"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useConta } from "./conta";
import { chaveDe, emSegundoPlano, gravar, ler } from "./nuvem";

/** Estado devolvido pela verificação ao vivo na fonte (espelho de lib/aovivo). */
export interface EstadoAoVivo {
  loteId: string; fonte: string; verificadoEm: string; ok: boolean;
  situacao: "aberto" | "encerrado" | "vendido" | "suspenso" | "retirado" | "indisponivel" | "desconhecido";
  lance_minimo?: number; lance_atual?: number; avaliacao?: number; data_leilao?: string; data_fim?: string; praca?: number; fotos?: string[];
  mudancas: string[]; erro?: string;
}
export const SITUACAO_LABEL: Record<EstadoAoVivo["situacao"], string> = { aberto: "Aberto", encerrado: "Encerrado", vendido: "Vendido", suspenso: "Suspenso", retirado: "Retirado", indisponivel: "Fora do ar na fonte", desconhecido: "Sem confirmação" };

const K = "garimpo:acompanhar", T = "lotwise_acompanhar";
type Registro = { estado: EstadoAoVivo | null; verificado_em: string | null };

/** Lotes acompanhados pela conta + último estado verificado. `verificar()` consulta a fonte agora. */
export function useAcompanhar() {
  const { user, sb, pronto } = useConta(); const uid = user?.id; const k = chaveDe(K, uid);
  const [itens, setItens] = useState<Record<string, Registro>>({});
  const [verificando, setVerificando] = useState(false); const [erro, setErro] = useState("");
  const emCurso = useRef(false);
  useEffect(() => { if (!pronto) return; setItens(ler<Record<string, Registro>>(k, {})); }, [k, pronto]);
  useEffect(() => {
    if (!uid || !sb) return; let vivo = true;
    sb.from(T).select("lote_id,estado,verificado_em").then(({ data }) => { if (!vivo || !data) return; const n = Object.fromEntries(data.map((d) => [d.lote_id as string, { estado: (d.estado as EstadoAoVivo) ?? null, verificado_em: (d.verificado_em as string) ?? null }])); setItens(n); gravar(k, n); });
    return () => { vivo = false; };
  }, [uid, sb, k]);
  const ids = Object.keys(itens);
  const seguir = (id: string) => { const n = { ...itens, [id]: { estado: null, verificado_em: null } }; setItens(n); gravar(k, n); if (uid && sb) emSegundoPlano(sb.from(T).upsert({ lote_id: id })); };
  const deixar = (id: string) => { const n = { ...itens }; delete n[id]; setItens(n); gravar(k, n); if (uid && sb) emSegundoPlano(sb.from(T).delete().eq("lote_id", id)); };
  const toggle = (id: string) => (itens[id] ? deixar(id) : seguir(id));
  /** Consulta a fonte de cada lote acompanhado (ou dos ids passados) e guarda o estado. */
  const verificar = useCallback(async (alvo?: string[]) => {
    const lista = (alvo ?? Object.keys(itens)).slice(0, 30); if (!lista.length || emCurso.current) return;
    emCurso.current = true; setVerificando(true); setErro("");
    try {
      const r = await fetch("/api/acompanhar/verificar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids: lista }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erro ?? `Erro ${r.status}`);
      const { estados } = (await r.json()) as { estados: EstadoAoVivo[] };
      setItens((atual) => {
        const n = { ...atual };
        for (const e of estados) { if (!n[e.loteId]) continue; n[e.loteId] = { estado: e, verificado_em: e.verificadoEm }; }
        gravar(k, n); return n;
      });
      if (uid && sb) emSegundoPlano(sb.from(T).upsert(estados.map((e) => ({ lote_id: e.loteId, estado: e, verificado_em: e.verificadoEm }))));
    } catch (e) { setErro((e as Error).message); } finally { emCurso.current = false; setVerificando(false); }
  }, [itens, k, uid, sb]);
  return { itens, ids, seguir, deixar, toggle, verificar, verificando, erro, segue: (id: string) => Boolean(itens[id]) };
}
