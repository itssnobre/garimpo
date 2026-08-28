"use client";
import Link from "next/link";
import { useIndice } from "@/lib/indice";
import SeletorUF, { useUFs } from "@/components/SeletorUF";
import { avaliarPadrao, REGRAS_BASE } from "@/lib/motor";
import { usePadroes } from "@/lib/usePadroes";
import Destaques from "@/components/Destaques";
export default function Sugeridos() {
  const { ativo, pronto } = usePadroes(); const regras = ativo ?? REGRAS_BASE;
  const { ufs, pronto: ufsProntas, definir } = useUFs(ativo?.ufs);
  const { imoveis: IMOVEIS, carregando } = useIndice(ufs);
  const go = IMOVEIS.map((i) => ({ i, a: avaliarPadrao(i, regras) })).filter((x) => x.a.passa).sort((x, y) => y.a.score - x.a.score);
  return (<>
    <div className="app-cab"><div><h1>Sugeridos</h1><p>{go.length.toLocaleString("pt-BR")} lotes passam no {ativo ? `padrão "${ativo.nome}"` : "padrão neutro"} hoje, ordenados por score.</p></div><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{ufsProntas && <SeletorUF ufs={ufs} onChange={definir} />}<Link href="/app/padrao" className="btn sec">{ativo ? "Ajustar padrão" : "Criar meu padrão"}</Link></div></div>
    {pronto && !ativo && <div className="sinal info" style={{ marginBottom: 12 }}>Sem padrão definido, os sugeridos usam uma base neutra. <Link href="/app/padrao?novo=1" style={{ textDecoration: "underline" }}>Criar o meu</Link>.</div>}
    {carregando && IMOVEIS.length === 0 ? <div className="vazio"><b>Carregando lotes…</b></div> : go.length === 0 ? <div className="vazio"><b>Nada passa no seu padrão hoje</b>Afrouxe alguma regra ou espere a próxima coleta.</div> : <Destaques itens={go.slice(0, 48)} />}
  </>);
}
