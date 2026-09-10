"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { usePadroes } from "@/lib/usePadroes";
import EditorPadrao from "@/components/EditorPadrao";
import { pct } from "@/lib/fmt";
import Portao from "@/components/Portao";
import { useT } from "@/lib/i18n/client";
function Conteudo() {
  const { t } = useT();
  const { lista, ativo, ativoId, pronto, salvar, remover, ativar, desativar } = usePadroes();
  const sp = useSearchParams(); const router = useRouter();
  const [editando, setEditando] = useState<string | "novo" | null>(sp.get("novo") ? "novo" : null);
  if (!pronto) return null;
  const alvo = editando === "novo" ? null : lista.find((p) => p.id === editando) ?? null;
  if (editando || lista.length === 0) return (<>
    <div className="app-cab"><div><h1>{alvo ? t("Editar: {nome}", { nome: alvo.nome }) : t("Crie o seu padrão")}</h1><p>{t("Faixa, deságio, margem, região, tipos, vetos e custos: as regras são suas. O catálogo inteiro passa a ser filtrado e pontuado por elas.")}</p></div></div>
    <EditorPadrao inicial={alvo} onSalvar={(p) => { salvar(p); setEditando(null); router.push("/app/buscar"); }} onCancelar={lista.length ? () => setEditando(null) : undefined} />
  </>);
  return (<>
    <div className="app-cab"><div><h1>{t("Meus padrões")}</h1><p>{t("Você pode ter vários (ex.: \"Revenda SP\", \"Renda litoral\"). O ativo é o que filtra a Busca, os Sugeridos e o Sage.")}</p></div><button className="btn ouro" onClick={() => setEditando("novo")}>{t("Novo padrão")}</button></div>
    <div className="grade">{lista.map((p) => <div key={p.id} className="painel" style={{ borderColor: p.id === ativoId ? "var(--accent)" : undefined }}>
      <h2 style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>{p.nome}{p.id === ativoId && <span className="badge go">{t("ativo")}</span>}</h2>
      <dl className="kv"><dt>{t("Deságio")}</dt><dd>&ge; {pct(p.desagioMin)}</dd><dt>{t("Margem")}</dt><dd>&ge; {pct(p.margemMin)}</dd><dt>{t("Região")}</dt><dd style={{ fontFamily: "var(--f-body)", whiteSpace: "normal" }}>{[...p.ufs, ...p.cidades].join(", ") || t("Brasil")}</dd><dt>{t("Tipos")}</dt><dd style={{ fontFamily: "var(--f-body)", whiteSpace: "normal" }}>{p.tipos.join(", ") || t("todos")}</dd></dl>
      <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>{p.id !== ativoId && <button className="btn mini" onClick={() => ativar(p.id)}>{t("Usar")}</button>}<button className="btn sec mini" onClick={() => setEditando(p.id)}>{t("Editar")}</button><button className="btn sec mini" style={{ color: "var(--bad)" }} onClick={() => { if (confirm(t("Apagar \"{nome}\"?", { nome: p.nome }))) remover(p.id); }}>{t("Apagar")}</button></div>
    </div>)}</div>
    <p style={{ marginTop: 16, color: "var(--mute)", fontSize: 13.5 }}>{ativo ? <>{t("Ativo:")} <b style={{ color: "var(--ink)" }}>{ativo.nome}</b>. <button className="btn ghost mini" onClick={desativar}>{t("Navegar sem padrão")}</button></> : t("Nenhum padrão ativo: a lista aparece sem pontuação. Toque em \"Usar\" para ativar um.")}</p>
  </>);
}

export default function PadraoPage() { const { t } = useT(); return <Portao titulo={t("Meu padrão")}><Suspense fallback={null}><Conteudo /></Suspense></Portao>; }
