"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { nuvemConfigurada, supabaseBrowser } from "@/lib/supabase/client";
import { MARCA } from "@/lib/marca";
import { traduz } from "@/lib/authErros";
import { useT } from "@/lib/i18n/client";
import { destinoSeguro } from "@/lib/destino";

type Modo = "entrar" | "criar";

function Formulario() {
  const { t } = useT();
  // O "next" vem da URL: só caminho interno vira destino (senão o login manda pro site do atacante).
  const params = useSearchParams(); const next = destinoSeguro(params.get("next"));
  const [modo, setModo] = useState<Modo>(params.get("modo") === "criar" ? "criar" : "entrar");
  const [nome, setNome] = useState(""); const [email, setEmail] = useState(""); const [senha, setSenha] = useState(""); const [senha2, setSenha2] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; txt: string } | null>(params.get("erro") === "link" ? { ok: false, txt: "Esse link expirou ou já foi usado. Peça outro." } : null);
  const [ocupado, setOcupado] = useState(false);
  const sb = supabaseBrowser();
  // Já logado: não faz sentido ver o formulário, segue pro destino.
  useEffect(() => { sb?.auth.getUser().then(({ data }) => { if (data.user) location.replace(next); }); }, [sb, next]);
  if (!nuvemConfigurada() || !sb) return <div className="sinal alerta">{t("Conta ainda não está ativa neste ambiente.")}</div>;
  // Só no navegador (dentro dos handlers): no servidor não existe location.
  const redirectUrl = () => `${location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg(null);
    if (modo === "criar" && senha !== senha2) { setMsg({ ok: false, txt: "As senhas não conferem." }); return; }
    if (modo === "criar" && nome.trim().length < 2) { setMsg({ ok: false, txt: "Diga como quer ser chamado." }); return; }
    setOcupado(true);
    try {
      if (modo === "entrar") { const { error } = await sb.auth.signInWithPassword({ email, password: senha }); if (error) throw error; location.href = next; return; }
      const { data, error } = await sb.auth.signUp({ email, password: senha, options: { emailRedirectTo: redirectUrl(), data: { nome: nome.trim() } } });
      if (error) throw error;
      if (data.session) { location.href = next; return; }
      setMsg({ ok: true, txt: "Conta criada. Confirme pelo link que enviamos ao seu e-mail e volte aqui para entrar com e-mail e senha." });
    } catch (err) { setMsg({ ok: false, txt: traduz((err as Error).message) }); } finally { setOcupado(false); }
  };

  const entrarGoogle = async () => {
    setMsg(null); setOcupado(true);
    const { error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: redirectUrl() } });
    if (error) { setMsg({ ok: false, txt: traduz(error.message) }); setOcupado(false); }
  };

  return (
    <form onSubmit={enviar} className="auth-card">
      <div className="chips" role="tablist" aria-label={t("Modo")}>
        {([["entrar", t("Entrar")], ["criar", t("Criar conta")]] as [Modo, string][]).map(([m, l]) => <button key={m} type="button" role="tab" aria-selected={modo === m} className={`chip ${modo === m ? "on" : ""}`} onClick={() => { setModo(m); setMsg(null); }}>{l}</button>)}
      </div>
      {modo === "criar" && <label className="campo"><span>{t("Seu nome")}</span><input autoComplete="name" required value={nome} onChange={(e) => setNome(e.target.value)} placeholder={t("Como quer ser chamado")} /></label>}
      <label className="campo"><span>{t("E-mail")}</span><input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("voce@exemplo.com")} /></label>
      <label className="campo"><span>{t("Senha")}{modo === "criar" ? t(" (mínimo 6 caracteres)") : ""}</span><input type="password" autoComplete={modo === "criar" ? "new-password" : "current-password"} required minLength={6} value={senha} onChange={(e) => setSenha(e.target.value)} /></label>
      {modo === "criar" && <label className="campo"><span>{t("Repita a senha")}</span><input type="password" autoComplete="new-password" required minLength={6} value={senha2} onChange={(e) => setSenha2(e.target.value)} /></label>}
      {msg && <div className={`sinal ${msg.ok ? "info" : "alerta"}`}>{t(msg.txt)}</div>}
      <button className="btn ouro" type="submit" disabled={ocupado}>{ocupado ? t("Aguarde…") : modo === "entrar" ? t("Entrar") : t("Criar conta")}</button>
      <div className="auth-ou"><span>{t("ou")}</span></div>
      <button type="button" className="btn sec btn-google" onClick={entrarGoogle} disabled={ocupado}>
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.8 6.1C12.3 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4 7.1-10 7.1-17z"/><path fill="#FBBC05" d="M10.4 28.6A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.6l-7.8-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l7.8-6.1z"/><path fill="#34A853" d="M24 48c6.2 0 11.6-2 15.4-5.6l-7.5-5.8c-2.1 1.4-4.8 2.3-7.9 2.3-6.3 0-11.7-4.1-13.6-9.9l-7.8 6.1C6.5 42.6 14.6 48 24 48z"/></svg>
        {modo === "entrar" ? t("Entrar com Google") : t("Criar conta com Google")}
      </button>
      {modo === "entrar" && <p style={{ margin: 0, fontSize: 13.5 }}><Link href={`/recuperar${email ? "?email=" + encodeURIComponent(email) : ""}`} style={{ textDecoration: "underline" }}>{t("Esqueci a senha")}</Link></p>}
    </form>
  );
}

export default function Entrar() {
  const { t } = useT();
  return (
    <section className="auth"><div className="auth-in">
      <p className="eyebrow auth-eyebrow">{t("Sua conta")}</p>
      <h1>{t("Entrar na {marca}", { marca: MARCA })}</h1>
      <p className="auth-lede">{t("Com conta você define o seu padrão, vê o catálogo inteiro com lance máximo e score, guarda favoritos e usa o Sage. Tudo segue você em qualquer aparelho.")}</p>
      <Suspense fallback={null}><Formulario /></Suspense>
      <p className="auth-pe"><Link href="/app/buscar" style={{ textDecoration: "underline" }}>{t("Só dar uma olhada sem conta")}</Link> <span style={{ color: "var(--mute)" }}>{t("(amostra de 30 lotes, sem análise)")}</span></p>
    </div></section>
  );
}
