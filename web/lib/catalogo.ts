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

export type Ordem = "score" | "margem" | "desagio" | "lance" | "data";
export type FiltrosBusca = {
  ufs?: string[]; cidade?: string; tipo?: string; fonte?: string; modalidade?: string; busca?: string;
  precoMin?: number; precoMax?: number; quartosMin?: number; areaMin?: number; areaMax?: number;
  soFoto?: boolean; ids?: string[];
  ocultarVeto?: boolean; ocultarEncerrados?: boolean; soComData?: boolean; ocultarSuspeitos?: boolean;
  padrao?: (FiltroPadrao & { margemMin?: number }) | null;
  ordem?: Ordem; inicio?: number; quantos?: number;
};

const SEM_ACENTO = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Monta a consulta com os filtros que o banco resolve. Margem e score ficam para o motor. */
function consulta(f: FiltrosBusca, campos: string, contar: boolean) {
  const sb = supabaseAdmin();
  if (!sb) return null;
  const hoje = new Date().toISOString().slice(0, 10);
  let q = contar ? sb.from(TABELA).select(campos, { count: "exact" }) : sb.from(TABELA).select(campos);
  if (f.ufs?.length) q = q.in("uf", f.ufs);
  if (f.ids?.length) q = q.in("id", f.ids.slice(0, 500));
  if (f.cidade) q = q.eq("cidade", f.cidade);
  if (f.tipo) q = q.eq("tipo", f.tipo);
  if (f.fonte) q = q.eq("fonte", f.fonte);
  if (f.modalidade) q = q.eq("modalidade", f.modalidade);
  if (f.precoMin && f.precoMin > 0) q = q.gte("lance_minimo", f.precoMin);
  if (f.precoMax && f.precoMax > 0) q = q.lte("lance_minimo", f.precoMax);
  if (f.quartosMin && f.quartosMin > 0) q = q.gte("quartos", f.quartosMin);
  if (f.areaMin && f.areaMin > 0) q = q.gte("area_util", f.areaMin);
  if (f.areaMax && f.areaMax > 0) q = q.lte("area_util", f.areaMax).gt("area_util", 0);
  if (f.soFoto) q = q.not("foto", "is", null);
  if (f.ocultarVeto !== false) q = q.eq("direitos_fiduciante", false).eq("fracao_ideal", false);
  if (f.ocultarEncerrados !== false) q = q.or(`data_leilao.is.null,data_leilao.gte.${hoje}`);
  if (f.soComData) q = q.not("data_leilao", "is", null);
  if (f.ocultarSuspeitos !== false) q = q.eq("valor_suspeito", false).lt("desagio_pct", 0.85);
  const b = (f.busca ?? "").trim();
  if (b) q = q.ilike("busca", `%${SEM_ACENTO(b).replace(/[%_]/g, " ")}%`);
  // Limites objetivos do padrão do usuário. A margem mínima não entra aqui de propósito.
  const p = f.padrao;
  if (p) {
    if (p.faixaMin && p.faixaMin > 0) q = q.gte("avaliacao", p.faixaMin);
    if (p.faixaMax && p.faixaMax > 0) q = q.lte("avaliacao", p.faixaMax);
    if (p.lanceMax && p.lanceMax > 0) q = q.lte("lance_minimo", p.lanceMax);
    if (p.desagioMin && p.desagioMin > 0) q = q.gte("desagio_pct", p.desagioMin);
    if (p.ufs?.length) q = q.in("uf", p.ufs);
    if (p.tipos?.length) q = q.in("tipo", p.tipos);
    if (p.modalidades?.length) q = q.in("modalidade", p.modalidades);
    if (p.ocupacao && p.ocupacao !== "qualquer") q = q.eq("ocupado", false);
    if (p.exigeFinanciamento) q = q.eq("aceita_financiamento", true);
    if (p.quartosMin && p.quartosMin > 0) q = q.gte("quartos", p.quartosMin);
    if (p.areaMin && p.areaMin > 0) q = q.gte("area_util", p.areaMin);
  }
  return q;
}

const ORDEM_SQL: Record<string, { coluna: string; asc: boolean }> = {
  desagio: { coluna: "desagio_pct", asc: false },
  lance: { coluna: "lance_minimo", asc: true },
  data: { coluna: "data_leilao", asc: true },
};

/** Página da busca. `total` é a contagem real do filtro, não o tamanho da página. */
export async function buscar(f: FiltrosBusca): Promise<{ itens: Imovel[]; total: number }> {
  const q = consulta(f, CAMPOS_LISTA, true);
  if (!q) return { itens: [], total: 0 };
  const inicio = Math.max(0, f.inicio ?? 0);
  const quantos = Math.min(200, Math.max(1, f.quantos ?? 48));
  const o = ORDEM_SQL[f.ordem ?? "desagio"] ?? ORDEM_SQL.desagio;
  const { data, error, count } = await q
    .order(o.coluna, { ascending: o.asc, nullsFirst: false })
    .order("id", { ascending: true })
    .range(inicio, inicio + quantos - 1);
  if (error || !data) return { itens: [], total: 0 };
  return { itens: (data as unknown as Linha[]).map(paraImovel), total: count ?? 0 };
}

/** Conjunto para o motor pontuar, quando a ordem ou o filtro dependem da conta de margem. */
export async function poolParaMotor(f: FiltrosBusca, teto = 1500): Promise<{ itens: Imovel[]; total: number; cortado: boolean }> {
  const q = consulta(f, CAMPOS_LISTA, true);
  if (!q) return { itens: [], total: 0, cortado: false };
  const { data, error, count } = await q.order("desagio_pct", { ascending: false }).order("id", { ascending: true }).range(0, teto - 1);
  if (error || !data) return { itens: [], total: 0, cortado: false };
  return { itens: (data as unknown as Linha[]).map(paraImovel), total: count ?? 0, cortado: (count ?? 0) > teto };
}

// ---------------------------------------------------------------------------------------------
// Espelho do condomínio: apartamentos do mesmo prédio (predio_id vem do build, collectors/common.py).
// As colunas novas ficam fora de CAMPOS_LISTA de propósito: se a migration ainda não estiver no
// banco, só estas consultas falham (e devolvem vazio), a busca e o resto do app seguem normais.
const CAMPOS_PREDIO = CAMPOS_LISTA + ",predio_id,bloco,unidade,andar,final";

export type ResumoPredio = {
  predio_id: string; uf: string; cidade: string; bairro: string | null; endereco: string | null;
  unidades: number; abertas: number; blocos: number; lance_min: number; lance_max: number; desagio_max: number;
};

/** Todos os lotes de um prédio, encerrados inclusive: a tela decide o que mostrar. */
export async function porPredio(predioId: string): Promise<Imovel[]> {
  if (!/^[0-9a-f]{12}$/.test(predioId)) return [];
  const local = await predioLocal();
  if (local) return local.porPredio(predioId);
  const sb = supabaseAdmin();
  if (!sb) return [];
  const { data, error } = await sb.from(TABELA).select(CAMPOS_PREDIO).eq("predio_id", predioId).order("lance_minimo", { ascending: true }).limit(400);
  if (error || !data) return [];
  return (data as unknown as Linha[]).map(paraImovel);
}

/** Quantas OUTRAS unidades do mesmo prédio estão com leilão aberto (ou sem data). Alimenta o aviso na página do lote. */
export async function outrasDoPredio(i: Imovel): Promise<number> {
  const predio = i.predio_id;
  if (!predio) return 0;
  const hoje = new Date().toISOString().slice(0, 10);
  const local = await predioLocal();
  if (local) return local.porPredio(predio).filter((x) => x.id !== i.id && (!x.data_leilao || x.data_leilao >= hoje)).length;
  const sb = supabaseAdmin();
  if (!sb) return 0;
  const { count, error } = await sb.from(TABELA).select("id", { count: "exact", head: true })
    .eq("predio_id", predio).neq("id", i.id).or(`data_leilao.is.null,data_leilao.gte.${hoje}`);
  return error ? 0 : count ?? 0;
}

/** Prédios com 2+ unidades abertas, os mais cheios primeiro: onde há vários apartamentos em leilão ao mesmo tempo. */
export async function predios(f: { uf?: string; limite?: number } = {}): Promise<ResumoPredio[]> {
  const limite = Math.min(200, Math.max(1, f.limite ?? 60));
  const local = await predioLocal();
  if (local) return local.predios(f.uf, limite);
  const sb = supabaseAdmin();
  if (!sb) return [];
  let q = sb.from("lotwise_catalogo_predios").select("*").gte("abertas", 2);
  if (f.uf) q = q.eq("uf", f.uf);
  const { data, error } = await q.order("abertas", { ascending: false }).order("predio_id", { ascending: true }).limit(limite);
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map((r) => ({
    ...(r as unknown as ResumoPredio),
    unidades: Number(r.unidades), abertas: Number(r.abertas), blocos: Number(r.blocos),
    lance_min: Number(r.lance_min), lance_max: Number(r.lance_max), desagio_max: Number(r.desagio_max),
  }));
}

/** Completa o lote com os campos do prédio quando o banco ainda não os tem (só no modo local de desenvolvimento). */
export async function comPredio(i: Imovel): Promise<Imovel> {
  if (i.predio_id) return i;
  const local = await predioLocal();
  const achado = local?.porId(i.id);
  return achado ? { ...i, predio_id: achado.predio_id, bloco: achado.bloco, unidade: achado.unidade, andar: achado.andar, final: achado.final } : i;
}

// Modo local (só desenvolvimento): LOTWISE_PREDIO_LOCAL=<caminho do web/data/imoveis.json> lê o catálogo do arquivo
// gerado pelo build, para ver o espelho antes da migration chegar ao banco. Em produção é ignorado.
type Local = { porPredio: (id: string) => Imovel[]; porId: (id: string) => Imovel | undefined; predios: (uf: string | undefined, limite: number) => ResumoPredio[] };
let localCache: Promise<Local | null> | null = null;
function predioLocal(): Promise<Local | null> {
  const arquivo = process.env.LOTWISE_PREDIO_LOCAL;
  if (!arquivo || process.env.NODE_ENV === "production") return Promise.resolve(null);
  localCache ??= (async () => {
    const { readFile } = await import("node:fs/promises");
    const todos = JSON.parse(await readFile(arquivo, "utf8")) as Imovel[];
    const grupos = new Map<string, Imovel[]>(); const ids = new Map<string, Imovel>();
    for (const i of todos) { ids.set(i.id, i); if (i.predio_id) { const g = grupos.get(i.predio_id) ?? []; g.push(i); grupos.set(i.predio_id, g); } }
    const hoje = new Date().toISOString().slice(0, 10);
    return {
      porPredio: (id) => [...(grupos.get(id) ?? [])].sort((a, b) => a.lance_minimo - b.lance_minimo),
      porId: (id) => ids.get(id),
      predios: (uf, limite) => [...grupos.entries()]
        .map(([predio_id, g]) => ({ predio_id, uf: g[0].uf, cidade: g[0].cidade, bairro: g[0].bairro ?? null, endereco: g[0].endereco ?? null,
          unidades: g.length, abertas: g.filter((x) => !x.data_leilao || x.data_leilao >= hoje).length, blocos: new Set(g.map((x) => x.bloco ?? "")).size,
          lance_min: Math.min(...g.map((x) => x.lance_minimo)), lance_max: Math.max(...g.map((x) => x.lance_minimo)), desagio_max: Math.max(0, ...g.filter((x) => !x.valor_suspeito).map((x) => x.desagio_pct)) }))
        .filter((p) => p.abertas >= 2 && (!uf || p.uf === uf))
        .sort((a, b) => b.abertas - a.abertas || a.predio_id.localeCompare(b.predio_id)).slice(0, limite),
    };
  })();
  return localCache;
}
