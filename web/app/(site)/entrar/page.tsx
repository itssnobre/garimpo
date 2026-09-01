"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { nuvemConfigurada, supabaseBrowser } from "@/lib/supabase/client";
import { MARCA } from "@/lib/marca";

type Modo = "entrar" | "criar" | "link";
const ERROS: Record<string, string> = {
  "Invalid login credentials": "E-mail ou senha não conferem.",
  "Email not confirmed": "Confirme o e-mail pelo link que enviamos antes de entrar.",
  "User already registered": "Já existe conta com este e-mail. Entre com a senha ou peça um link.",
  "Password should be at least 6 characters": "A senha precisa ter pelo menos 6 caracteres.",
  "Email rate limit exceeded": "Muitos e-mails em pouco tempo. Aguarde alguns minutos.",
};
const traduz = (m: string) => ERROS[m] ?? Object.entries(ERROS).find(([k]) => m.includes(k))?.[1] ?? m;

function Formulario() {
  const params = useSearchParams(); const next = params.get("next") ?? "/app/buscar";
  const [modo, setModo] = useState<Modo>("entrar"); const [email, setEmail] = useState(""); const [senha, setSenha] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; txt: string } | null>(params.get("erro") === "link" ? { ok: false, txt: "Esse link expirou ou já foi usado. Peça outro." } : null);
  const [ocupado, setOcupado] = useState(false);
  const sb = supabaseBrowser();
  if (!nuvemConfigurada() || !sb) return <div className="sinal alerta">Conta ainda não está ativa neste ambiente. Favoritos, padrão e pipeline continuam salvos neste navegador.</div>;
  const redirect = `${location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg(null); setOcupado(true);
    try {
      if (modo === "entrar") { const { error } = await sb.auth.signInWithPassword({ email, password: senha }); if (error) throw error; location.href = next; return; }
      if (modo === "criar") { const { data, error } = await sb.auth.signUp({ email, password: senha, options: { emailRedirectTo: redirect } }); if (error) throw error; if (data.session) { location.href = next; return; } setMsg({ ok: true, txt: "Conta criada. Confirme pelo link que enviamos ao seu e-mail e volte aqui para entrar." }); return; }
      const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect } }); if (error) throw error;
      setMsg({ ok: true, txt: "Link enviado. Abra o e-mail neste mesmo aparelho e toque no link para entrar." });
    } catch (err) { setMsg({ ok: false, txt: traduz((err as Error).message) }); } finally { setOcupado(false); }
  };

  return (
    <form onSubmit={enviar} className="painel" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="chips" role="tablist" aria-label="Modo">
        {([["entrar", "Entrar"], ["criar", "Criar conta"], ["link", "Link por e-mail"]] as [Modo, string][]).map(([m, l]) => <button key={m} type="button" role="tab" aria-selected={modo === m} className={`chip ${modo === m ? "on" : ""}`} onClick={() => { setModo(m); setMsg(null); }}>{l}</button>)}
      </div>
      <label className="campo"><span>E-mail</span><input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@exemplo.com" /></label>
      {modo !== "link" && <label className="campo"><span>Senha{modo === "criar" ? " (mínimo 6 caracteres)" : ""}</span><input type="password" autoComplete={modo === "criar" ? "new-password" : "current-password"} required minLength={6} value={senha} onChange={(e) => setSenha(e.target.value)} /></label>}
      {msg && <div className={`sinal ${msg.ok ? "info" : "alerta"}`}>{msg.txt}</div>}
      <button className="btn ouro" type="submit" disabled={ocupado}>{ocupado ? "Aguarde…" : modo === "entrar" ? "Entrar" : modo === "criar" ? "Criar conta" : "Enviar link"}</button>
      <p style={{ margin: 0, fontSize: 12.5, color: "var(--mute)", lineHeight: 1.5 }}>{modo === "link" ? "Sem senha: você recebe um link de acesso único no e-mail." : "Esqueceu a senha? Use \"Link por e-mail\" para entrar e troque a senha em Configurações."}</p>
    </form>
  );
}

export default function Entrar() {
  return (
    <section className="secao" style={{ maxWidth: 460, margin: "0 auto", padding: "48px var(--pad) 72px" }}>
      <p className="eyebrow">Sua conta</p>
      <h1 style={{ fontFamily: "var(--f-display)", fontSize: 30, margin: "6px 0 8px" }}>Entrar na {MARCA}</h1>
      <p style={{ color: "var(--mute)", margin: "0 0 20px", fontSize: 15 }}>Com conta, favoritos, padrão e pipeline seguem você em qualquer aparelho. O que já está neste navegador entra junto no primeiro login.</p>
      <Suspense fallback={null}><Formulario /></Suspense>
      <p style={{ marginTop: 18, fontSize: 13.5 }}><Link href="/app/buscar" style={{ textDecoration: "underline" }}>Continuar sem conta</Link></p>
    </section>
  );
}
