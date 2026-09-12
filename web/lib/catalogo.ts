// Catálogo de lotes no banco. Só o servidor fala com ele: a tabela não é exposta ao PostgREST
// público, e é aqui que ficam o teto por consulta e a montagem do lote completo.
import "server-only";
import { supabaseAdmin } from "./supabase/admin";
import type { Imovel } from "./types";

const TABELA = "lotwise_catalogo";

// Colunas que a listagem precisa. Deixar `detalhe` de fora é o que mantém a consulta barata:
// descrição e fotos ficam fora da linha no Postgres e só são lidas quando alguém abre o lote.
const CAMPOS_LISTA = [
  "id", "fonte", "url", "tipo", "titulo", "endereco", "bairro", "cidade", "uf", "cep",
  "area_privativa_m2", "area_terreno_m2", "quartos", "vagas", "avaliacao", "lance_minimo",
  "desagio_pct", "modalidade", "praca", "data_leilao", "data_fim", "ocupado",
  "aceita_financiamento", "aceita_fgts", "debitos_por_conta_comprador", "direitos_fiduciante",
  "fracao_ideal", "dominio_util", "massa_falida", "direitos_aquisitivos", "onus_averbado",
  "debitos_teto10", "valor_suspeito", "avaliacao_outra_fonte", "matricula", "leiloeiro",
  "foto", "coletado_em",
].join(",");

type Linha = Record<string, unknown> & { detalhe?: Record<string, unknown> };

/** A linha do banco volta com as colunas na raiz e o resto em `detalhe`: aqui vira o Imovel de novo. */
function paraImovel(l: Linha): Imovel {
  const { detalhe, atualizado_em: _a, busca: _b, ...resto } = l as Linha & { atualizado_em?: string; busca?: string };
  const i = { ...resto, ...(detalhe ?? {}) } as unknown as Imovel;
  // Numérico do Postgres chega como string no PostgREST: o motor faz conta com esses campos.
  for (const k of ["avaliacao", "lance_minimo", "desagio_pct", "area_privativa_m2", "area_terreno_m2", "avaliacao_outra_fonte"] as const) {
    const v = (i as unknown as Record<string, unknown>)[k];
    if (typeof v === "string") (i as unknown as Record<string, unknown>)[k] = Number(v);
  }
  return i;
}

/** Um lote com tudo (descrição, fotos, links): é o que a página do imóvel mostra. */
export async function porId(id: string): Promise<Imovel | null> {
  const sb = supabaseAdmin();
  if (!sb) return null;
  const { data, error } = await sb.from(TABELA).select("*").eq("id", id).maybeSingle();
  if (error || !data) return null;
  return paraImovel(data as Linha);
}

/** Vários lotes por id (favoritos, pipeline, acompanhar). Sem descrição e fotos: quem chama monta cards. */
export async function porIds(ids: string[], comDetalhe = false): Promise<Imovel[]> {
  const sb = supabaseAdmin();
  if (!sb || !ids.length) return [];
  const { data, error } = await sb.from(TABELA).select(comDetalhe ? "*" : CAMPOS_LISTA).in("id", ids.slice(0, 200));
  if (error || !data) return [];
  return (data as unknown as Linha[]).map(paraImovel);
}

/** Quantos lotes existem por estado, já descontando leilão encerrado. Serve aos painéis. */
export async function contagemPorUF(): Promise<Record<string, { total: number; abertos: number }>> {
  const sb = supabaseAdmin();
  if (!sb) return {};
  const { data, error } = await sb.from("lotwise_catalogo_por_uf").select("uf,total,abertos");
  if (error || !data) return {};
  const fora: Record<string, { total: number; abertos: number }> = {};
  for (const r of data as { uf: string; total: number; abertos: number }[]) fora[r.uf] = { total: Number(r.total), abertos: Number(r.abertos) };
  return fora;
}

export async function total(): Promise<number> {
  const sb = supabaseAdmin();
  if (!sb) return 0;
  const { count } = await sb.from(TABELA).select("id", { count: "exact", head: true });
  return count ?? 0;
}

/** Filtros do padrão que o SQL resolve sozinho. Margem e score ficam de fora de propósito:
 *  eles dependem dos custos do usuário, e duplicar essa conta em SQL criaria duas verdades. */
type FiltroPadrao = {
  faixaMin?: number; faixaMax?: number; lanceMax?: number; desagioMin?: number;
  ufs?: string[]; tipos?: string[]; modalidades?: string[];
  ocupacao?: string; exigeFinanciamento?: boolean;
  quartosMin?: number; areaMin?: number;
  vetoFiduciante?: boolean; vetoFracao?: boolean;
};

/** Candidatos para o motor avaliar: o banco corta o que é objetivo, o servidor faz a conta fina. */
export async function candidatos(r: FiltroPadrao | null, limite = 400): Promise<Imovel[]> {
  const sb = supabaseAdmin();
  if (!sb) return [];
  const hoje = new Date().toISOString().slice(0, 10);
  let q = sb.from(TABELA).select(CAMPOS_LISTA).or(`data_leilao.is.null,data_leilao.gte.${hoje}`).eq("valor_suspeito", false);
  if (r) {
    if (r.faixaMin && r.faixaMin > 0) q = q.gte("avaliacao", r.faixaMin);
    if (r.faixaMax && r.faixaMax > 0) q = q.lte("avaliacao", r.faixaMax);
    if (r.lanceMax && r.lanceMax > 0) q = q.lte("lance_minimo", r.lanceMax);
    if (r.desagioMin && r.desagioMin > 0) q = q.gte("desagio_pct", r.desagioMin);
    if (r.ufs?.length) q = q.in("uf", r.ufs);
    if (r.tipos?.length) q = q.in("tipo", r.tipos);
    if (r.modalidades?.length) q = q.in("modalidade", r.modalidades);
    if (r.ocupacao && r.ocupacao !== "qualquer") q = q.eq("ocupado", false);
    if (r.exigeFinanciamento) q = q.eq("aceita_financiamento", true);
    if (r.quartosMin && r.quartosMin > 0) q = q.gte("quartos", r.quartosMin);
    if (r.vetoFiduciante !== false) q = q.eq("direitos_fiduciante", false);
    if (r.vetoFracao !== false) q = q.eq("fracao_ideal", false);
  } else {
    q = q.eq("direitos_fiduciante", false).eq("fracao_ideal", false);
  }
  const { data, error } = await q.order("desagio_pct", { ascending: false }).limit(limite);
  if (error || !data) return [];
  return (data as unknown as Linha[]).map(paraImovel);
}

/** Busca por cidade, bairro, rua ou matrícula. O texto no banco já está sem acento e em minúsculas. */
export async function porTermos(termos: string[], limite = 25): Promise<Imovel[]> {
  const sb = supabaseAdmin();
  if (!sb || !termos.length) return [];
  const limpos = termos.map((t) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[%,()*]/g, "")).filter((t) => t.length > 3).slice(0, 6);
  if (!limpos.length) return [];
  const { data, error } = await sb.from(TABELA).select(CAMPOS_LISTA)
    .or(limpos.map((t) => `busca.ilike.*${t}*`).join(",")).limit(limite);
  if (error || !data) return [];
  return (data as unknown as Linha[]).map(paraImovel);
}
