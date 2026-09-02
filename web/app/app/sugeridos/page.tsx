"use client";
import Link from "next/link";
import { useIndice } from "@/lib/indice";
import SeletorUF, { useUFs } from "@/components/SeletorUF";
import { avaliarPadrao } from "@/lib/motor";
import { usePadroes } from "@/lib/usePadroes";
import Destaques from "@/components/Destaques";
import Portao from "@/components/Portao";
function Conteudo() {
  const { ativo, pronto } = usePadroes();
  const { ufs, pronto: ufsProntas, definir } = useUFs(ativo?.ufs);
  const { imoveis: IMOVEIS, carregando } = useIndice(ativo ? ufs : []);
  if (!pronto) return null;
  if (!ativo) return (<>
    <div className="app-cab"><div><h1>Sugeridos</h1><p>Os lotes que passam nas suas regras, ordenados por score.</p></div></div>
    <div className="vazio"><b>Sugeridos precisam do seu padrão</b>Faixa, deságio, margem, região e vetos são seus. Sem eles não há o que sugerir.<p style={{ margin: "14px 0 0" }}><Link href="/app/padrao?novo=1" className="btn ouro">Criar meu padrão</Link></p></div>
  </>);
  // Só leilões ainda abertos e sem valor suspeito: sugestão tem que ser acionável.
  const hoje = new Date().toISOString().slice(0, 10);
  const go = IMOVEIS.filter((i) => (!i.data_leilao || i.data_leilao >= hoje) && !i.valor_suspeito && i.desagio_pct < 0.85).map((i) => ({ i, a: avaliarPadrao(i, ativo) })).filter((x) => x.a.passa).sort((x, y) => y.a.score - x.a.score);
  return (<>
    <div className="app-cab"><div><h1>Sugeridos</h1><p>{go.length.toLocaleString("pt-BR")} lotes passam no padrão "{ativo.nome}" hoje, ordenados por score.</p></div><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{ufsProntas && <SeletorUF ufs={ufs} onChange={definir} />}<Link href="/app/padrao" className="btn sec">Ajustar padrão</Link></div></div>
    {carregando && IMOVEIS.length === 0 ? <div className="vazio"><b>Carregando lotes…</b></div> : go.length === 0 ? <div className="vazio"><b>Nada passa no seu padrão hoje</b>Afrouxe alguma regra ou espere a próxima coleta.</div> : <Destaques itens={go.slice(0, 48)} />}
  </>);
}
export default function Sugeridos() { return <Portao titulo="Sugeridos"><Conteudo /></Portao>; }
