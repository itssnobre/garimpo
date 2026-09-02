"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Portao from "@/components/Portao";
import { useAcompanhar, SITUACAO_LABEL, type EstadoAoVivo } from "@/lib/acompanhar";
import { useLotes } from "@/lib/indice";
import { usePadroes } from "@/lib/usePadroes";
import { avaliarPadrao, FONTE_LABEL, MODALIDADE_LABEL } from "@/lib/motor";
import { brl, dataBR } from "@/lib/fmt";
import { tituloLimpo } from "@/lib/util";
import { IDoc, IRelogio } from "@/components/Icones";

const INTERVALO = 120; // segundos entre verificações automáticas com a página aberta
const classeDe = (s: EstadoAoVivo["situacao"]) => (s === "aberto" ? "go" : s === "desconhecido" ? "" : s === "indisponivel" || s === "suspenso" ? "atencao" : "nogo");
const ha = (iso: string | null) => { if (!iso) return "nunca"; const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000); return m < 1 ? "agora" : m < 60 ? `há ${m} min` : m < 1440 ? `há ${Math.round(m / 60)} h` : `há ${Math.round(m / 1440)} d`; };

function Conteudo() {
  const { itens, ids, deixar, verificar, verificando, erro } = useAcompanhar();
  const { imoveis } = useLotes(ids); const { ativo } = usePadroes();
  const [contagem, setContagem] = useState(INTERVALO); const idsRef = useRef(ids.join(","));
  // Verifica ao abrir e a cada INTERVALO s enquanto a aba estiver visível; para quando ela fica em segundo plano.
  useEffect(() => { if (ids.length && idsRef.current !== ids.join(",") + "!") { idsRef.current = ids.join(",") + "!"; verificar(); } }, [ids, verificar]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState !== "visible" || !ids.length) return; setContagem((c) => { if (c <= 1) { verificar(); return INTERVALO; } return c - 1; }); }, 1000);
    return () => clearInterval(t);
  }, [ids.length, verificar]);
  const linhas = ids.map((id) => ({ id, i: imoveis.find((x) => x.id === id), r: itens[id] })).sort((a, b) => (a.r.estado?.mudancas.length ? 0 : 1) - (b.r.estado?.mudancas.length ? 0 : 1));
  const ultima = linhas.map((l) => l.r.verificado_em).filter(Boolean).sort().pop() ?? null;
  return (<>
    <div className="app-cab"><div><h1>Acompanhar</h1><p>Os lotes que você marcou, conferidos direto na fonte: lance, data, praça e situação. Enquanto esta tela estiver aberta, a conferência repete sozinha a cada {INTERVALO / 60} minutos.</p></div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span className="sub" style={{ fontSize: 12.5 }}>{verificando ? "Conferindo na fonte…" : ultima ? `Última conferência ${ha(ultima)} · próxima em ${contagem}s` : ""}</span>
        <button className="btn ouro" onClick={() => verificar()} disabled={verificando || !ids.length}>{verificando ? "Aguarde…" : "Conferir agora"}</button>
      </div></div>
    {erro && <div className="sinal alerta" style={{ marginBottom: 12 }}>{erro}</div>}
    {!ids.length ? <div className="vazio"><b>Nenhum lote acompanhado</b>Abra um lote e toque em "Acompanhar". Ele passa a ser conferido na fonte sempre que esta tela estiver aberta.<p style={{ margin: "14px 0 0" }}><Link href="/app/buscar" className="btn ouro">Ir para a busca</Link></p></div> : (
      <div className="acomp-lista">{linhas.map(({ id, i, r }) => {
        const e = r.estado; const a = i && ativo ? avaliarPadrao(i, ativo) : null;
        const lance = e?.lance_atual ?? e?.lance_minimo ?? i?.lance_minimo; const data = e?.data_leilao ?? i?.data_leilao;
        return (
          <article key={id} className={`acomp ${e?.mudancas.length ? "mudou" : ""}`}>
            <Link href={`/app/imovel/${encodeURIComponent(id)}`} className="acomp-foto">{i?.fotos?.[0] || i?.foto ? <img src={i.fotos?.[0] ?? i.foto} alt="" referrerPolicy="no-referrer" /> : <span className="semfoto">sem foto</span>}</Link>
            <div className="acomp-corpo">
              <div className="acomp-cab">
                <div><Link href={`/app/imovel/${encodeURIComponent(id)}`} className="acomp-tit">{i ? tituloLimpo(i) : id}</Link><p className="sub">{i ? `${i.cidade}/${i.uf} · ${FONTE_LABEL[i.fonte] ?? i.fonte} · ${MODALIDADE_LABEL[i.modalidade]}` : ""}</p></div>
                <span className={`badge ${e ? classeDe(e.situacao) : ""}`}>{e ? SITUACAO_LABEL[e.situacao] : "ainda não conferido"}</span>
              </div>
              <div className="acomp-dados">
                <div><span>Lance {e?.lance_atual !== undefined ? "atual" : "mínimo"}</span><b className="num">{lance ? brl(lance) : "—"}</b>{e?.lance_minimo !== undefined && i && e.lance_minimo !== i.lance_minimo && <small>coletado: {brl(i.lance_minimo)}</small>}</div>
                <div><span>Avaliação</span><b className="num">{brl(e?.avaliacao ?? i?.avaliacao ?? 0)}</b></div>
                <div><span>Leilão</span><b>{data ? dataBR(data) : "sem data"}</b>{(e?.praca ?? i?.praca) ? <small>{e?.praca ?? i?.praca}ª praça</small> : null}</div>
                {a && <div><span>Seu teto (30%)</span><b className="num">{brl(a.res.lanceMax30)}</b><small>score {a.score}</small></div>}
              </div>
              {e?.mudancas.length ? <ul className="acomp-mud">{e.mudancas.map((m, k) => <li key={k}>{m}</li>)}</ul> : null}
              {e && !e.ok && <p className="sub" style={{ margin: "6px 0 0", color: "var(--warn)" }}>Não consegui ler a fonte agora{e.erro ? `: ${e.erro}` : ""}. Abra na fonte para confirmar.</p>}
              <div className="acomp-pe">
                <span className="sub"><IRelogio /> conferido {ha(r.verificado_em)}</span>
                <span style={{ display: "flex", gap: 8 }}>{i && <a className="btn sec mini" href={i.url} target="_blank" rel="noreferrer"><IDoc />Abrir na fonte</a>}<button className="btn ghost mini" onClick={() => deixar(id)}>Deixar de acompanhar</button></span>
              </div>
            </div>
          </article>);
      })}</div>)}
  </>);
}
export default function Acompanhar() { return <Portao titulo="Acompanhar"><Conteudo /></Portao>; }
