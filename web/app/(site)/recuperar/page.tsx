"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { nuvemConfigurada, supabaseBrowser } from "@/lib/supabase/client";
import { traduz } from "@/lib/authErros";
import { useT } from "@/lib/i18n/client";

function Formulario() {
  const { t } = useT();
  const params = useSearchParams();
  const [email, setEmail] = useState(params.get("email") ?? ""); const [msg, setMsg] = useState<{ ok: boolean; txt: string } | null>(null); const [ocupado, setOcupado] = useState(false);
  const sb = supabaseBrowser();
  if (!nuvemConfigurada() || !sb) return <div className="sinal alerta">{t("Conta ainda não está ativa neste ambiente.")}</div>;
  const enviar = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg(null); setOcupado(true);
    try {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent("/redefinir-senha")}` });
      if (error) throw error;
      setMsg({ ok: true, txt: "Se existir conta com este e-mail, você recebe um link para criar uma senha nova. Abra o e-mail neste mesmo aparelho." });
    } catch (err) { setMsg({ ok: false, txt: traduz((err as Error).message) }); } finally { setOcupado(false); }
  };
  return (
    <form onSubmit={enviar} className="auth-card">
      <label className="campo"><span>{t("E-mail da conta")}</span><input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("voce@exemplo.com")} /></label>
      {msg && <div className={`sinal ${msg.ok ? "info" : "alerta"}`}>{t(msg.txt)}</div>}
      <button className="btn ouro" type="submit" disabled={ocupado || Boolean(msg?.ok)}>{ocupado ? t("Aguarde…") : t("Enviar link de recuperação")}</button>
    </form>
  );
}
export default function Recuperar() {
  const { t } = useT();
  return (
    <section className="auth"><div className="auth-in">
      <p className="eyebrow auth-eyebrow">{t("Sua conta")}</p>
      <h1>{t("Recuperar a senha")}</h1>
      <p className="auth-lede">{t("Enviamos um link único para o seu e-mail. Ele abre uma tela para você definir a senha nova.")}</p>
      <Suspense fallback={null}><Formulario /></Suspense>
      <p className="auth-pe"><Link href="/entrar" style={{ textDecoration: "underline" }}>{t("Voltar para entrar")}</Link></p>
    </div></section>
  );
}
