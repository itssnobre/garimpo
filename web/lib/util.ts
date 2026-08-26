export function diasAte(iso?: string): number | null {
  if (!iso) return null;
  const d = new Date(iso + "T12:00:00").getTime() - Date.now();
  return Math.ceil(d / 86400000);
}
export function urgencia(iso?: string): { txt: string; nivel: "hoje" | "breve" | "normal" | "passou" } | null {
  const n = diasAte(iso);
  if (n === null) return null;
  if (n < 0) return { txt: "encerrado", nivel: "passou" };
  if (n === 0) return { txt: "encerra hoje", nivel: "hoje" };
  if (n === 1) return { txt: "encerra amanhã", nivel: "hoje" };
  if (n <= 7) return { txt: `encerra em ${n} dias`, nivel: "breve" };
  return { txt: `em ${n} dias`, nivel: "normal" };
}
export const mapsUrl = (end: string) => "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(end);
