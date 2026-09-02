"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { usePadroes } from "@/lib/usePadroes";
import EditorPadrao from "@/components/EditorPadrao";
import { pct } from "@/lib/fmt";
import Portao from "@/components/Portao";
function Conteudo() {
  const { lista, ativo, ativoId, pronto, salvar, remover, ativar, desativar } = usePadroes();
  const sp = useSearchParams(); const router = useRouter();
  const [editando, setEditando] = useState<string | "novo" | null>(sp.get("novo") ? "novo" : null);
  if (!pronto) return null;
  const alvo = editando === "novo" ? null : lista.find((p) => p.id === editando) ?? null;
  if (editando || lista.length === 0) return (<>
    <div className="app-cab"><div><h1>{alvo ? `Editar: ${alvo.nome}` : "Crie o seu padrão"}</h1><p>Faixa, deságio, margem, região, tipos, vetos e custos: as regras são suas. O catálogo inteiro passa a ser filtrado e pontuado por elas.</p></div></div>
    <EditorPadrao inicial={alvo} onSalvar={(p) => { salvar(p); setEditando(null); router.push("/app/buscar"); }} onCancelar={lista.length ? () => setEditando(null) : undefined} />
  </>);
  return (<>
    <div className="app-cab"><div><h1>Meus padrões</h1><p>Você pode ter vários (ex.: "Revenda SP", "Renda litoral"). O ativo é o que filtra a Busca, os Sugeridos e o Sage.</p></div><button className="btn ouro" onClick={() => setEditando("novo")}>Novo padrão</button></div>
    <div className="grade">{lista.map((p) => <div key={p.id} className="painel" style={{ borderColor: p.id === ativoId ? "var(--accent)" : undefined }}>
      <h2 style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>{p.nome}{p.id === ativoId && <span className="badge go">ativo</span>}</h2>
      <dl className="kv"><dt>Deságio</dt><dd>≥ {pct(p.desagioMin)}</dd><dt>Margem</dt><dd>≥ {pct(p.margemMin)}</dd><dt>Região</dt><dd style={{ fontFamily: "var(--f-body)", whiteSpace: "normal" }}>{[...p.ufs, ...p.cidades].join(", ") || "Brasil"}</dd><dt>Tipos</dt><dd style={{ fontFamily: "var(--f-body)", whiteSpace: "normal" }}>{p.tipos.join(", ") || "todos"}</dd></dl>
      <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>{p.id !== ativoId && <button className="btn mini" onClick={() => ativar(p.id)}>Usar</button>}<button className="btn sec mini" onClick={() => setEditando(p.id)}>Editar</button><button className="btn sec mini" style={{ color: "var(--bad)" }} onClick={() => { if (confirm(`Apagar "${p.nome}"?`)) remover(p.id); }}>Apagar</button></div>
    </div>)}</div>
    <p style={{ marginTop: 16, color: "var(--mute)", fontSize: 13.5 }}>{ativo ? <>Ativo: <b style={{ color: "var(--ink)" }}>{ativo.nome}</b>. <button className="btn ghost mini" onClick={desativar}>Navegar sem padrão</button></> : "Nenhum padrão ativo: a lista aparece sem pontuação. Toque em \"Usar\" para ativar um."}</p>
  </>);
}

export default function PadraoPage() { return <Portao titulo="Meu padrão"><Suspense fallback={null}><Conteudo /></Suspense></Portao>; }
