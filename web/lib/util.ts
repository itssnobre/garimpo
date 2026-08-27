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

const TIPO_LABEL: Record<string, string> = { apartamento: "Apartamento", casa: "Casa", terreno: "Terreno", comercial: "Imóvel comercial", rural: "Imóvel rural", outro: "Imóvel" };

// Os títulos das fontes são longos e cheios de sigla. Monta um título limpo com os dados do lote.
export function tituloLimpo(i: { tipo: string; area_privativa_m2?: number; area_terreno_m2?: number; quartos?: number; bairro?: string; cidade: string; uf: string }) {
  const t = TIPO_LABEL[i.tipo] ?? "Imóvel";
  const area = i.area_privativa_m2 ?? i.area_terreno_m2;
  const partes = [t];
  if (area) partes.push(`de ${area.toLocaleString("pt-BR")} m²`);
  if (i.quartos) partes.push(`com ${i.quartos} ${i.quartos > 1 ? "dormitórios" : "dormitório"}`);
  const base = partes.join(" ");
  return `${base}, ${i.bairro ?? i.cidade}`;
}
