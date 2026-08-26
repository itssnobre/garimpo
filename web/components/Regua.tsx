import { brl } from "@/lib/motor";
// Régua de Lance: do lance mínimo (esq.) até a avaliação (dir.). Verde = margem >= 35%, âmbar = 25 a 35%, cinza = abaixo de 25%.
// Marca ouro = lance máximo pra margem alvo de 30%; marca preta = lance atual.
export default function Regua({ minimo, avaliacao, lance, max25, max30, max35, grande }: { minimo: number; avaliacao: number; lance?: number; max25: number; max30: number; max35: number; grande?: boolean }) {
  const ini = Math.min(minimo, max35, lance ?? minimo) * 0.97, fim = Math.max(avaliacao, max25 * 1.02, lance ?? 0);
  const p = (v: number) => Math.max(0, Math.min(100, ((v - ini) / (fim - ini)) * 100));
  const fmt = (v: number) => (v >= 1e6 ? (v / 1e6).toFixed(2) + "M" : Math.round(v / 1000) + "k");
  const p30 = p(max30), p35 = p(max35), p25 = p(max25);
  const alinha = (x: number): React.CSSProperties => (x < 14 ? { left: x + "%", transform: "none" } : x > 86 ? { left: x + "%", transform: "translateX(-100%)" } : { left: x + "%" });
  const separados = grande && p25 - p35 > 16;
  return (
    <div className={`regua ${grande ? "grande" : ""}`} style={{ ["--p35" as string]: p35 + "%", ["--p25" as string]: p25 + "%" }} aria-label={`Régua de lance: mínimo ${brl(minimo)}, máximo para 30% ${brl(max30)}, avaliação ${brl(avaliacao)}`}>
      <div className="barra" />
      {lance !== undefined && <div className="marca-lance" style={{ left: p(lance) + "%" }} title={`Seu lance ${brl(lance)}`} />}
      {separados && <span className="tick" style={alinha(p35)}>35% {fmt(max35)}</span>}
      {separados && <span className="tick" style={alinha(p25)}>25% {fmt(max25)}</span>}
      <span className="tick ouro" style={alinha(p30)}><i />30% {grande ? brl(max30) : fmt(max30)}</span>
      <span className="ini">mín. {fmt(minimo)}</span>
      <span className="fim">aval. {fmt(avaliacao)}</span>
    </div>
  );
}
