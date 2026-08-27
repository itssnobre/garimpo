// Formatação única de números. Nunca quebrar linha dentro de um valor.
const NB = " ";
export const brl = (v: number) => "R$" + NB + Math.round(v).toLocaleString("pt-BR");
export function brlCurto(v: number) {
  const a = Math.abs(v);
  if (a >= 1e6) return "R$" + NB + (v / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 2, minimumFractionDigits: v % 1e6 === 0 ? 0 : 1 }) + NB + "mi";
  if (a >= 1e3) return "R$" + NB + Math.round(v / 1e3).toLocaleString("pt-BR") + NB + "mil";
  return brl(v);
}
export const pct = (v: number, casas = 0) => (v * 100).toLocaleString("pt-BR", { maximumFractionDigits: casas, minimumFractionDigits: casas }) + "%";
export const dataBR = (iso?: string | null, opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short" }) => iso ? new Date(iso.length === 10 ? iso + "T12:00:00" : iso).toLocaleDateString("pt-BR", opts) : null;

// Matrícula curta para cards: só o número principal, sem sufixos de CNM/observação.
export const matriculaCurta = (m?: string) => { if (!m) return null; const p = m.trim().split(/[\s(;,]/)[0].replace(/[.:]$/, ""); return p.length > 14 ? p.slice(0, 14) + "…" : p; };
