"use client";
import { Suspense, useState } from "react";
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
    <form onSubmit={enviar} className="painel" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
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
    <section className="secao" style={{ maxWidth: 460, margin: "0 auto", padding: "48px var(--pad) 72px" }}>
      <p className="eyebrow">Sua conta</p>
      <h1 style={{ fontFamily: "var(--f-display)", fontSize: 30, margin: "6px 0 8px" }}>Entrar na {MARCA}</h1>
      <p style={{ color: "var(--mute)", margin: "0 0 20px", fontSize: 15 }}>Com conta você define o seu padrão, vê o catálogo inteiro com lance máximo e score, guarda favoritos e usa o Sage. Tudo segue você em qualquer aparelho.</p>
      <Suspense fallback={null}><Formulario /></Suspense>
      <p style={{ marginTop: 18, fontSize: 13.5 }}><Link href="/app/buscar" style={{ textDecoration: "underline" }}>Só dar uma olhada sem conta</Link> <span style={{ color: "var(--mute)" }}>(amostra de 30 lotes, sem análise)</span></p>
    </section>
  );
}
