"use client";
import { useT } from "@/lib/i18n/client";
// Campo de dinheiro com máscara sensível ao idioma: digita só números, formata conforme o idioma ativo (pt-BR 1.234,56 / en-US 1,234.56).
export default function CampoMoeda({ valor, onChange, id, casas = 0 }: { valor: number; onChange: (v: number) => void; id?: string; casas?: 0 | 2 }) {
  const { lang } = useT();
  const fmt = (v: number) => v.toLocaleString(lang === "en" ? "en-US" : "pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
  return (
    <div className="campo-moeda">
      <span className="cifra">R$</span>
      <input id={id} type="text" inputMode="numeric" className="num" value={fmt(valor)}
        onChange={(e) => { const d = e.target.value.replace(/\D/g, ""); onChange(casas ? Number(d) / 100 : Number(d)); }}
        onFocus={(e) => e.target.select()} />
    </div>);
}
