import type { T } from "@/lib/i18n";
import { fmtLang } from "@/lib/fmt";

export function diasAte(iso?: string): number | null {
  if (!iso) return null;
  const d = new Date(iso + "T12:00:00").getTime() - Date.now();
  return Math.ceil(d / 86400000);
}
export function urgencia(iso?: string, t: T = (s) => s): { txt: string; nivel: "hoje" | "breve" | "normal" | "passou" } | null {
  const n = diasAte(iso);
  if (n === null) return null;
  if (n < 0) return { txt: t("encerrado"), nivel: "passou" };
  if (n === 0) return { txt: t("encerra hoje"), nivel: "hoje" };
  if (n === 1) return { txt: t("encerra amanhã"), nivel: "hoje" };
  if (n <= 7) return { txt: t("encerra em {n} dias", { n }), nivel: "breve" };
  return { txt: t("em {n} dias", { n }), nivel: "normal" };
}
export const mapsUrl = (end: string) => "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(end);

const TIPO_LABEL: Record<string, string> = { apartamento: "Apartamento", casa: "Casa", terreno: "Terreno", comercial: "Imóvel comercial", rural: "Imóvel rural", outro: "Imóvel" };

// Os títulos das fontes são longos e cheios de sigla. Monta um título limpo com os dados do lote.
export function tituloLimpo(i: { tipo: string; area_privativa_m2?: number; area_terreno_m2?: number; quartos?: number; bairro?: string; cidade: string; uf: string }, t: T = (s) => s) {
  const rotulo = t(TIPO_LABEL[i.tipo] ?? "Imóvel");
  const area = i.area_privativa_m2 ?? i.area_terreno_m2;
  const partes = [rotulo];
  if (area) partes.push(t("de {v} m²", { v: area.toLocaleString(fmtLang() === "en" ? "en-US" : "pt-BR") }));
  if (i.quartos) partes.push(t(i.quartos > 1 ? "com {n} dormitórios" : "com {n} dormitório", { n: i.quartos }));
  const base = partes.join(" ");
  return `${base}, ${i.bairro ?? i.cidade}`;
}
