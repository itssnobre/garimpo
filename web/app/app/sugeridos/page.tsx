"use client";
import Link from "next/link";
import { IMOVEIS } from "@/lib/data";
import { avaliarPadrao, REGRAS_BASE } from "@/lib/motor";
import { usePadroes } from "@/lib/usePadroes";
import Destaques from "@/components/Destaques";
export default function Sugeridos() {
  const { ativo, pronto } = usePadroes(); const regras = ativo ?? REGRAS_BASE;
  const go = IMOVEIS.map((i) => ({ i, a: avaliarPadrao(i, regras) })).filter((x) => x.a.passa).sort((x, y) => y.a.score - x.a.score);
  return (<>
    <div className="app-cab"><div><h1>Sugeridos</h1><p>{go.length.toLocaleString("pt-BR")} lotes passam no {ativo ? `padrão "${ativo.nome}"` : "padrão neutro"} hoje, ordenados por score.</p></div><Link href="/app/padrao" className="btn sec">{ativo ? "Ajustar padrão" : "Criar meu padrão"}</Link></div>
    {pronto && !ativo && <div className="sinal info" style={{ marginBottom: 12 }}>Sem padrão definido, os sugeridos usam uma base neutra. <Link href="/app/padrao?novo=1" style={{ textDecoration: "underline" }}>Criar o meu</Link>.</div>}
    {go.length === 0 ? <div className="vazio"><b>Nada passa no seu padrão hoje</b>Afrouxe alguma regra ou espere a próxima coleta.</div> : <Destaques itens={go.slice(0, 48)} />}
  </>);
}
