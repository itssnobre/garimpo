// i18n mínimo, estilo gettext: a chave é o texto em português; sem tradução, devolve o próprio texto.
// Interpolação: t("encerra em {n} dias", { n: 3 }). Idioma vem do cookie "lang" (pt | en), padrão pt.
import { EN } from "./en";

export type Lang = "pt" | "en";
export const LANG_COOKIE = "lang";
export const LANGS: Lang[] = ["pt", "en"];
export const normalizarLang = (v?: string | null): Lang => (v === "en" ? "en" : "pt");

export type Vars = Record<string, string | number>;
export type T = (texto: string, vars?: Vars) => string;

function interpolar(s: string, vars?: Vars) {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

export function traduzir(lang: Lang, texto: string, vars?: Vars): string {
  const base = lang === "en" ? (EN[texto] ?? texto) : texto;
  return interpolar(base, vars);
}

export const tPara = (lang: Lang): T => (texto, vars) => traduzir(lang, texto, vars);
