"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { nuvemConfigurada, supabaseBrowser } from "@/lib/supabase/client";
import { traduz } from "@/lib/authErros";

function Formulario() {
  const params = useSearchParams();
  const [email, setEmail] = useState(params.get("email") ?? ""); const [msg, setMsg] = useState<{ ok: boolean; txt: string } | null>(null); const [ocupado, setOcupado] = useState(false);
  const sb = supabaseBrowser();
  if (!nuvemConfigurada() || !sb) return <div className="sinal alerta">Conta ainda não está ativa neste ambiente.</div>;
  const enviar = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg(null); setOcupado(true);
    try {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent("/redefinir-senha")}` });
      if (error) throw error;
      setMsg({ ok: true, txt: "Se existir conta com este e-mail, você recebe um link para criar uma senha nova. Abra o e-mail neste mesmo aparelho." });
    } catch (err) { setMsg({ ok: false, txt: traduz((err as Error).message) }); } finally { setOcupado(false); }
  };
  return (
    <form onSubmit={enviar} className="painel" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <label className="campo"><span>E-mail da conta</span><input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@exemplo.com" /></label>
      {msg && <div className={`sinal ${msg.ok ? "info" : "alerta"}`}>{msg.txt}</div>}
      <button className="btn ouro" type="submit" disabled={ocupado || Boolean(msg?.ok)}>{ocupado ? "Aguarde…" : "Enviar link de recuperação"}</button>
    </form>
  );
}
export default function Recuperar() {
  return (
    <section className="secao" style={{ maxWidth: 460, margin: "0 auto", padding: "48px var(--pad) 72px" }}>
      <p className="eyebrow">Sua conta</p>
      <h1 style={{ fontFamily: "var(--f-display)", fontSize: 30, margin: "6px 0 8px" }}>Recuperar a senha</h1>
      <p style={{ color: "var(--mute)", margin: "0 0 20px", fontSize: 15 }}>Enviamos um link único para o seu e-mail. Ele abre uma tela para você definir a senha nova.</p>
      <Suspense fallback={null}><Formulario /></Suspense>
      <p style={{ marginTop: 18, fontSize: 13.5 }}><Link href="/entrar" style={{ textDecoration: "underline" }}>Voltar para entrar</Link></p>
    </section>
  );
}
