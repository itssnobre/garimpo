"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { nuvemConfigurada, supabaseBrowser } from "@/lib/supabase/client";
import { MARCA } from "@/lib/marca";
import { traduz } from "@/lib/authErros";

type Modo = "entrar" | "criar";

function Formulario() {
  const params = useSearchParams(); const next = params.get("next") ?? "/app/buscar";
  const [modo, setModo] = useState<Modo>(params.get("modo") === "criar" ? "criar" : "entrar");
  const [nome, setNome] = useState(""); const [email, setEmail] = useState(""); const [senha, setSenha] = useState(""); const [senha2, setSenha2] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; txt: string } | null>(params.get("erro") === "link" ? { ok: false, txt: "Esse link expirou ou já foi usado. Peça outro." } : null);
  const [ocupado, setOcupado] = useState(false);
  const sb = supabaseBrowser();
  // Já logado: não faz sentido ver o formulário, segue pro destino.
  useEffect(() => { sb?.auth.getUser().then(({ data }) => { if (data.user) location.replace(next); }); }, [sb, next]);
  if (!nuvemConfigurada() || !sb) return <div className="sinal alerta">Conta ainda não está ativa neste ambiente.</div>;
  const redirect = `${location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg(null);
    if (modo === "criar" && senha !== senha2) { setMsg({ ok: false, txt: "As senhas não conferem." }); return; }
    if (modo === "criar" && nome.trim().length < 2) { setMsg({ ok: false, txt: "Diga como quer ser chamado." }); return; }
    setOcupado(true);
    try {
      if (modo === "entrar") { const { error } = await sb.auth.signInWithPassword({ email, password: senha }); if (error) throw error; location.href = next; return; }
      const { data, error } = await sb.auth.signUp({ email, password: senha, options: { emailRedirectTo: redirect, data: { nome: nome.trim() } } });
      if (error) throw error;
      if (data.session) { location.href = next; return; }
      setMsg({ ok: true, txt: "Conta criada. Confirme pelo link que enviamos ao seu e-mail e volte aqui para entrar com e-mail e senha." });
    } catch (err) { setMsg({ ok: false, txt: traduz((err as Error).message) }); } finally { setOcupado(false); }
  };

  return (
    <form onSubmit={enviar} className="auth-card">
      <div className="chips" role="tablist" aria-label="Modo">
        {([["entrar", "Entrar"], ["criar", "Criar conta"]] as [Modo, string][]).map(([m, l]) => <button key={m} type="button" role="tab" aria-selected={modo === m} className={`chip ${modo === m ? "on" : ""}`} onClick={() => { setModo(m); setMsg(null); }}>{l}</button>)}
      </div>
      {modo === "criar" && <label className="campo"><span>Seu nome</span><input autoComplete="name" required value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Como quer ser chamado" /></label>}
      <label className="campo"><span>E-mail</span><input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@exemplo.com" /></label>
      <label className="campo"><span>Senha{modo === "criar" ? " (mínimo 6 caracteres)" : ""}</span><input type="password" autoComplete={modo === "criar" ? "new-password" : "current-password"} required minLength={6} value={senha} onChange={(e) => setSenha(e.target.value)} /></label>
      {modo === "criar" && <label className="campo"><span>Repita a senha</span><input type="password" autoComplete="new-password" required minLength={6} value={senha2} onChange={(e) => setSenha2(e.target.value)} /></label>}
      {msg && <div className={`sinal ${msg.ok ? "info" : "alerta"}`}>{msg.txt}</div>}
      <button className="btn ouro" type="submit" disabled={ocupado}>{ocupado ? "Aguarde…" : modo === "entrar" ? "Entrar" : "Criar conta"}</button>
      {modo === "entrar" && <p style={{ margin: 0, fontSize: 13.5 }}><Link href={`/recuperar${email ? "?email=" + encodeURIComponent(email) : ""}`} style={{ textDecoration: "underline" }}>Esqueci a senha</Link></p>}
    </form>
  );
}

export default function Entrar() {
  return (
    <section className="auth"><div className="auth-in">
      <p className="eyebrow auth-eyebrow">Sua conta</p>
      <h1>Entrar na {MARCA}</h1>
      <p className="auth-lede">Com conta você define o seu padrão, vê o catálogo inteiro com lance máximo e score, guarda favoritos e usa o Sage. Tudo segue você em qualquer aparelho.</p>
      <Suspense fallback={null}><Formulario /></Suspense>
      <p className="auth-pe"><Link href="/app/buscar" style={{ textDecoration: "underline" }}>Só dar uma olhada sem conta</Link> <span style={{ color: "var(--mute)" }}>(amostra de 30 lotes, sem análise)</span></p>
    </div></section>
  );
}
