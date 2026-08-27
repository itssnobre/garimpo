"use client";
// Campo de dinheiro com máscara pt-BR: digita só números, aparece 1.234.567,89.
export default function CampoMoeda({ valor, onChange, id, casas = 0 }: { valor: number; onChange: (v: number) => void; id?: string; casas?: 0 | 2 }) {
  const fmt = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
  return (
    <div className="campo-moeda">
      <span className="cifra">R$</span>
      <input id={id} type="text" inputMode="numeric" className="num" value={fmt(valor)}
        onChange={(e) => { const d = e.target.value.replace(/\D/g, ""); onChange(casas ? Number(d) / 100 : Number(d)); }}
        onFocus={(e) => e.target.select()} />
    </div>);
}
