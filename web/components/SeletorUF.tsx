"use client";
import { useEffect, useState } from "react";
import { DISPONIVEIS_TOTAL, disponiveisUF, META, UFS_DISPONIVEIS, UFS_NOMES } from "@/lib/meta";
import { lerUFsSalvas, salvarUFs } from "@/lib/indice";

const S = { width: 15, height: 15, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const Pino = () => <svg {...S}><path d="M12 21s-6-5.3-6-10a6 6 0 1 1 12 0c0 4.7-6 10-6 10z" /><circle cx="12" cy="11" r="2.2" /></svg>;
const Xis = () => <svg {...S} width={13} height={13}><path d="M6 6l12 12M18 6L6 18" /></svg>;

/** Escolha de UFs (vazio = Brasil inteiro). Persiste no navegador. */
export function useUFs(padrao: string[] | undefined) {
  const [ufs, setUfs] = useState<string[] | null>(null);
  // Escolha salva > estados do padrão ativo > Brasil inteiro.
  useEffect(() => { setUfs(lerUFsSalvas() ?? (padrao?.length ? padrao : [])); }, [padrao]);
  const definir = (n: string[]) => { setUfs(n); salvarUFs(n); };
  return { ufs: ufs ?? [], pronto: ufs !== null, definir };
}

export default function SeletorUF({ ufs, onChange }: { ufs: string[]; onChange: (u: string[]) => void }) {
  const [aberto, setAberto] = useState(false);
  // Conta só o disponível (leilão aberto, sem veto, sem valor suspeito), para bater com a lista.
  const total = ufs.length ? ufs.reduce((n, u) => n + disponiveisUF(u), 0) : DISPONIVEIS_TOTAL;
  const alternar = (u: string) => onChange(ufs.includes(u) ? ufs.filter((x) => x !== u) : [...ufs, u].sort());
  return (
    <div className="seluf">
      <button className={`fbtn ${ufs.length ? "on" : ""}`} onClick={() => setAberto((a) => !a)} aria-expanded={aberto}>
        <Pino /><span>{ufs.length === 0 ? "Todo o Brasil" : ufs.length <= 3 ? ufs.join(" · ") : `${ufs.length} estados`}</span><i className="conta">{total.toLocaleString("pt-BR")}</i>
      </button>
      {aberto && (<>
        <div className="fpanel-fundo" onClick={() => setAberto(false)} />
        <div className="fpanel seluf-panel" role="dialog" aria-label="Estados">
          <div className="fpanel-cab"><b>Onde você compra</b><button className="btn ghost mini" onClick={() => setAberto(false)} aria-label="Fechar"><Xis /></button></div>
          <p className="seluf-dica">Escolha um ou mais estados. Os números são os lotes disponíveis hoje (leilão aberto, sem veto, sem valor suspeito). Sem escolha, carrega o país inteiro ({DISPONIVEIS_TOTAL.toLocaleString("pt-BR")} lotes, mais pesado).</p>
          <div className="seluf-grade">
            <button className={`ufchip ${ufs.length === 0 ? "on" : ""}`} onClick={() => onChange([])}>Brasil<small>{DISPONIVEIS_TOTAL.toLocaleString("pt-BR")}</small></button>
            {UFS_DISPONIVEIS.map((u) => <button key={u} className={`ufchip ${ufs.includes(u) ? "on" : ""}`} onClick={() => alternar(u)} title={UFS_NOMES[u]}>{u}<small>{disponiveisUF(u).toLocaleString("pt-BR")}</small></button>)}
          </div>
        </div>
      </>)}
    </div>
  );
}
