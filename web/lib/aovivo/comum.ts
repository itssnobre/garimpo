// Utilitários de parse compartilhados pelos extratores ao vivo.
// Portados de collectors/common.py (money, datas) com as correções que os
// coletores fazem caso a caso (ponto como separador de milhar sem centavos).
import type { SituacaoAoVivo } from "./tipos";

/** Mesmo User-Agent de collectors/common.py. */
export const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

export const CABECALHOS_PADRAO: Record<string, string> = {
  "User-Agent": UA,
  "Accept-Language": "pt-BR,pt;q=0.9",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

/**
 * "R$ 123.456,78" -> 123456.78 ; "R$ 419.000" -> 419000 ; "146,54" -> 146.54 ; "600.00" -> 600.
 * Regra: com vírgula, o ponto é milhar. Sem vírgula, o ponto só é decimal quando
 * o último grupo não tem 3 dígitos (senão "419.000" viraria 419).
 */
export function dinheiro(v: unknown): number | undefined {
  if (v === null || v === undefined) return undefined;
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  const s = String(v).replace(/[^\d,.]/g, "");
  if (!s) return undefined;
  let limpo: string;
  if (s.includes(",")) {
    limpo = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(".")) {
    const partes = s.split(".");
    const ultima = partes[partes.length - 1] ?? "";
    limpo = ultima.length === 3 ? partes.join("") : partes.slice(0, -1).join("") + "." + ultima;
  } else {
    limpo = s;
  }
  const n = Number(limpo);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Aceita também o formato americano que algumas fontes usam em campos importados
 * ("$92,000.00", "1,732,000.00"). Porte de money_any() de collectors/frazao.py.
 */
export function dinheiroQualquer(v: unknown): number | undefined {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  if (/\d,\d{3}(\.\d{1,2})?\s*$/.test(s) && !/\.\d{3},/.test(s)) {
    const n = Number(s.replace(/[^\d.]/g, ""));
    return Number.isFinite(n) ? n : undefined;
  }
  return dinheiro(s);
}

/** Número positivo ou undefined (usado nos campos numéricos das APIs). */
export function positivo(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : dinheiro(v);
  return n !== undefined && n > 0 ? n : undefined;
}

/** Primeira data encontrada, em ISO YYYY-MM-DD. Aceita ISO, dd/mm/aaaa e dd/mm/aa. */
export function paraISO(s?: string | null): string | undefined {
  if (!s) return undefined;
  const t = String(s);
  const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = /(\d{2})\/(\d{2})\/(\d{4})/.exec(t);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const curto = /(\d{2})\/(\d{2})\/(\d{2})(?!\d)/.exec(t);
  if (curto) return `20${curto[3]}-${curto[2]}-${curto[1]}`;
  return undefined;
}

const ENTIDADES: Record<string, string> = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", ordf: "ª", ordm: "º",
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", atilde: "ã", otilde: "õ",
  ccedil: "ç", acirc: "â", ecirc: "ê", ocirc: "ô", agrave: "à", uuml: "ü", ndash: "-", mdash: "-",
};

/** Desfaz entidades HTML (nomeadas comuns + numéricas). */
export function desescapar(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-zA-Z]+);/g, (todo, nome: string) => ENTIDADES[nome.toLowerCase()] ?? todo);
}

/** HTML -> texto com quebras de linha nos blocos (equivalente ao get_text("\n") do bs4). */
export function texto(html: string): string {
  let t = html.replace(/<(script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");
  t = t.replace(/<!--[\s\S]*?-->/g, " ");
  t = t.replace(/<br\s*\/?>/gi, "\n");
  t = t.replace(/<\/(p|div|li|tr|td|th|h[1-6]|span|section|article|ul|ol|table|option|label)>/gi, "\n");
  t = t.replace(/<[^>]+>/g, " ");
  t = desescapar(t);
  t = t.replace(/[ \t ​]+/g, " ");
  t = t.replace(/[ \t]*\n[ \t]*/g, "\n");
  return t.replace(/\n{2,}/g, "\n").trim();
}

/** Mesmo texto, mas numa linha só: útil para regex que atravessa quebras. */
export function textoPlano(html: string): string {
  return texto(html).replace(/\n/g, " ").replace(/\s{2,}/g, " ");
}

function comG(re: RegExp): RegExp {
  return re.flags.includes("g") ? re : new RegExp(re.source, re.flags + "g");
}

/** Trecho logo depois de um rótulo (todas as ocorrências, em ordem). */
export function trechosApos(t: string, rotulo: RegExp, janela = 90): string[] {
  const re = comG(rotulo);
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const ini = m.index + m[0].length;
    out.push(t.slice(ini, ini + janela));
    if (re.lastIndex <= m.index) re.lastIndex = m.index + 1;
  }
  return out;
}

/** Primeiro "R$ x" logo depois de um rótulo. */
export function dinheiroApos(t: string, rotulo: RegExp, janela = 90): number | undefined {
  for (const trecho of trechosApos(t, rotulo, janela)) {
    const m = /R\$\s*([\d.,]+)/.exec(trecho) ?? /([\d]{1,3}(?:\.\d{3})+(?:,\d{2})?|\d+,\d{2})/.exec(trecho);
    const v = m ? dinheiro(m[1]) : undefined;
    if (v !== undefined && v > 0) return v;
  }
  return undefined;
}

/**
 * Último "R$ x" logo ANTES de um rótulo. Alguns sites (Zuk) põem o valor acima do
 * rótulo ("R$ 0,00 | Maior lance até agora").
 */
export function dinheiroAntes(t: string, rotulo: RegExp, janela = 60): number | undefined {
  const re = comG(rotulo);
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const trecho = t.slice(Math.max(0, m.index - janela), m.index);
    const achados = [...trecho.matchAll(/R\$\s*([\d.,]+)/g)];
    const ultimo = achados[achados.length - 1];
    if (ultimo) {
      const v = dinheiro(ultimo[1]);
      if (v !== undefined) return v;
    }
    if (re.lastIndex <= m.index) re.lastIndex = m.index + 1;
  }
  return undefined;
}

/** Primeira data logo depois de um rótulo, em ISO. */
export function dataApos(t: string, rotulo: RegExp, janela = 90): string | undefined {
  for (const trecho of trechosApos(t, rotulo, janela)) {
    const d = paraISO(trecho);
    if (d) return d;
  }
  return undefined;
}

const VAZIAS = new Set(["img", "br", "hr", "input", "meta", "link", "source", "col", "area", "base", "embed", "track", "wbr"]);

function conteudo(html: string, tag: string, inicio: number): string {
  const re = new RegExp(`<(/?)${tag}\\b[^>]*?(/?)>`, "gi");
  re.lastIndex = inicio;
  let nivel = 1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[2] === "/") continue; // auto-fechada
    nivel += m[1] === "/" ? -1 : 1;
    if (nivel === 0) return html.slice(inicio, m.index);
  }
  return html.slice(inicio, inicio + 20000);
}

/** HTML interno de cada elemento que tem a classe pedida (equivale a soup.select(".classe")). */
export function blocos(html: string, classe: string): string[] {
  const abre = /<([a-zA-Z][\w-]*)\b([^>]*)>/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = abre.exec(html))) {
    const tag = (m[1] ?? "").toLowerCase();
    if (VAZIAS.has(tag)) continue;
    const attrs = m[2] ?? "";
    const cm = /class\s*=\s*"([^"]*)"|class\s*=\s*'([^']*)'/i.exec(attrs);
    if (!cm) continue;
    const cls = (cm[1] ?? cm[2] ?? "").trim().split(/\s+/);
    if (!cls.includes(classe)) continue;
    out.push(conteudo(html, tag, abre.lastIndex));
  }
  return out;
}

/** Classes do elemento que abre um bloco encontrado por `blocos` (mesma ordem). */
export function classesDe(html: string, classe: string): string[][] {
  const abre = /<([a-zA-Z][\w-]*)\b([^>]*)>/g;
  const out: string[][] = [];
  let m: RegExpExecArray | null;
  while ((m = abre.exec(html))) {
    if (VAZIAS.has((m[1] ?? "").toLowerCase())) continue;
    const cm = /class\s*=\s*"([^"]*)"|class\s*=\s*'([^']*)'/i.exec(m[2] ?? "");
    if (!cm) continue;
    const cls = (cm[1] ?? cm[2] ?? "").trim().split(/\s+/);
    if (cls.includes(classe)) out.push(cls);
  }
  return out;
}

/** Transforma caminho relativo em absoluto usando a url base. */
export function absoluta(base: string, url?: string | null): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url, base).toString();
  } catch {
    return undefined;
  }
}

/** Junta fotos sem repetir, limitando o tamanho da lista. */
export function fotosUnicas(lista: (string | undefined | null)[], limite = 12): string[] | undefined {
  const out: string[] = [];
  for (const f of lista) {
    if (!f) continue;
    if (out.includes(f)) continue;
    out.push(f);
    if (out.length >= limite) break;
  }
  return out.length ? out : undefined;
}

const PALAVRAS: [RegExp, SituacaoAoVivo][] = [
  [/\b(arrematad[oa]|vendid[oa]|lote vendido|venda concluída|venda concluida)\b/i, "vendido"],
  [/\b(suspens[oa]|sobrestad[oa])\b/i, "suspenso"],
  [/\b(retirad[oa]|cancelad[oa]|baixad[oa] do leil[ãa]o)\b/i, "retirado"],
  [/\b(encerrad[oa]|finalizad[oa]|leil[ãa]o encerrado|lote encerrado|j[áa] foi encerrado)\b/i, "encerrado"],
];

/** Situação a partir de palavras de status de uma fonte (texto curto, não a página inteira). */
export function situacaoPorTexto(t?: string | null): SituacaoAoVivo | undefined {
  if (!t) return undefined;
  for (const [re, s] of PALAVRAS) if (re.test(t)) return s;
  if (/\b(aberto para lance|em leil[ãa]o|em pregão|em pregao|dispon[íi]vel|aberto|liberado para lance|receber lances|fa[çc]a seu lance)\b/i.test(t)) {
    return "aberto";
  }
  return undefined;
}

/** Cache curto por processo (evita refazer a mesma chamada auxiliar num lote de verificações). */
const cache = new Map<string, { em: number; valor: unknown }>();

export async function memo<T>(chave: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(chave);
  if (hit && Date.now() - hit.em < ttlMs) return hit.valor as T;
  const valor = await fn();
  cache.set(chave, { em: Date.now(), valor });
  return valor;
}

/** GET/POST auxiliar dentro de um extrator (timeout curto, mesmos cabeçalhos do motor). */
export async function buscar(
  url: string,
  opcoes: { metodo?: string; cabecalhos?: Record<string, string>; corpo?: string; timeoutMs?: number } = {},
): Promise<{ status: number; corpo: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opcoes.timeoutMs ?? 12_000);
  try {
    const r = await fetch(url, {
      method: opcoes.metodo ?? "GET",
      headers: { ...CABECALHOS_PADRAO, ...(opcoes.cabecalhos ?? {}) },
      body: opcoes.corpo,
      redirect: "follow",
      signal: ctrl.signal,
    });
    return { status: r.status, corpo: await r.text() };
  } finally {
    clearTimeout(t);
  }
}

/** JSON auxiliar; devolve null em erro ou resposta não-JSON. */
export async function buscarJson<T = unknown>(
  url: string,
  opcoes: { metodo?: string; cabecalhos?: Record<string, string>; corpo?: string; timeoutMs?: number } = {},
): Promise<T | null> {
  try {
    const r = await buscar(url, { ...opcoes, cabecalhos: { Accept: "application/json", ...(opcoes.cabecalhos ?? {}) } });
    if (r.status !== 200) return null;
    return JSON.parse(r.corpo) as T;
  } catch {
    return null;
  }
}

export function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

export function lista(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

export function texto0(v: unknown): string {
  return typeof v === "string" ? v : v === null || v === undefined ? "" : String(v);
}
