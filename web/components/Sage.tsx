"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePadroes } from "@/lib/usePadroes";
import { useT } from "@/lib/i18n/client";
type M = { role: "user" | "assistant"; content: string };
const SUG = ["Quais os 5 melhores lotes em Sorocaba hoje?", "Qual o lance máximo pra 30% de margem neste lote?", "O que é perigoso em leilão SFI da Caixa?", "Compare os apartamentos com margem acima de 35%"];
export default function Sage({ loteId, loteNome }: { loteId?: string; loteNome?: string }) {
  const { t } = useT();
  const { ativo } = usePadroes();
  const [msgs, setMsgs] = useState<M[]>([{ role: "assistant", content: loteNome ? t('Estou com o lote "{nome}" aberto. Pergunte sobre risco, lance máximo ou o que checar na matrícula.', { nome: loteNome }) : t("Sou o Sage. Conheço todos os lotes da coleta e o padrão do garimpo. Pergunte por cidade, faixa, margem ou sobre um lote específico.") }]);
  const [txt, setTxt] = useState(""); const [carregando, setCarregando] = useState(false); const fim = useRef<HTMLDivElement>(null);
  useEffect(() => { if (msgs.length > 1 || carregando) fim.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [msgs, carregando]);
  async function enviar(texto: string) {
    if (!texto.trim() || carregando) return;
    const novo: M[] = [...msgs, { role: "user", content: texto }]; setMsgs(novo); setTxt(""); setCarregando(true);
    try { const r = await fetch("/api/sage", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mensagens: novo.filter((m, k) => !(k === 0 && m.role === "assistant")), loteId, padrao: ativo }) }); const d = await r.json(); setMsgs([...novo, { role: "assistant", content: d.texto }]); }
    catch (e) { setMsgs([...novo, { role: "assistant", content: t("Falhou a conexão. Tente de novo.") }]); } finally { setCarregando(false); }
  }
  const render = (c: string) => c.split(/(\/app\/imovel\/[^\s)]+)/g).map((p, k) => p.startsWith("/app/imovel/") ? <Link key={k} href={p} style={{ textDecoration: "underline", color: "var(--accent-ink)" }}>{t("abrir lote")}</Link> : p);
  return (
    <div className="chat">
      <div className="chat-log">{msgs.map((m, k) => <div key={k} className={`msg ${m.role === "user" ? "eu" : "sage"}`}>{m.role === "assistant" && <span className="quem">SAGE</span>}{render(m.content)}</div>)}{carregando && <div className="msg sage"><span className="quem">SAGE</span><span className="pensando"><i /><i /><i /></span></div>}<div ref={fim} /></div>
      <div><div className="sugest">{SUG.map((s) => <button key={s} onClick={() => enviar(s)}>{t(s)}</button>)}</div>
        <form className="chat-form" onSubmit={(e) => { e.preventDefault(); enviar(txt); }}><input value={txt} onChange={(e) => setTxt(e.target.value)} placeholder={t("Pergunte ao Sage sobre lotes, risco ou lance")} disabled={carregando} /><button className="btn ouro" disabled={carregando}>{t("Enviar")}</button></form></div>
    </div>);
}
