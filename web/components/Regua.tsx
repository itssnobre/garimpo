import { brl, brlCurto } from "@/lib/fmt";
// Régua de Lance: do lance mínimo (esq.) até a avaliação (dir.). Verde = margem >= 35%, âmbar = 25 a 35%, cinza = abaixo de 25%.
// Marca champanhe = lance máximo pra margem alvo de 30%; marca escura = lance atual.
export default function Regua({ minimo, avaliacao, lance, max25, max30, max35, grande }: { minimo: number; avaliacao: number; lance?: number; max25: number; max30: number; max35: number; grande?: boolean }) {
  const ini = Math.min(minimo, max35, lance ?? minimo) * 0.97, fim = Math.max(avaliacao, max25 * 1.02, lance ?? 0);
  const p = (v: number) => Math.max(0, Math.min(100, ((v - ini) / (fim - ini)) * 100));
  const p30 = p(max30), p35 = p(max35), p25 = p(max25);
  const cls = (x: number) => (x < 18 ? "esq" : x > 82 ? "dir" : "");
  return (
    <div className={`regua ${grande ? "grande" : ""}`} style={{ ["--p35" as string]: p35 + "%", ["--p25" as string]: p25 + "%" }} aria-label={`Régua de lance: mínimo ${brl(minimo)}, máximo para 30% de margem ${brl(max30)}, avaliação ${brl(avaliacao)}`}>
      <div className="barra" />
      {lance !== undefined && <div className="marca-lance" style={{ left: p(lance) + "%" }} title={`Seu lance ${brl(lance)}`} />}
      <span className={`tick ouro ${cls(p30)}`} style={{ left: p30 + "%" }}>Pague até {brlCurto(max30)}</span>
      <span className="ini">Lance inicial<b>{brlCurto(minimo)}</b></span>
      <span className="fim">Vale<b>{brlCurto(avaliacao)}</b></span>
    </div>
  );
}
