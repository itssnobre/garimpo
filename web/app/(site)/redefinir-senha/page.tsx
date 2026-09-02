"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { nuvemConfigurada, supabaseBrowser } from "@/lib/supabase/client";
import { traduz } from "@/lib/authErros";

export default function RedefinirSenha() {
  const sb = supabaseBrowser();
  const [estado, setEstado] = useState<"checando" | "ok" | "sem-sessao">("checando"); const [email, setEmail] = useState("");
  const [senha, setSenha] = useState(""); const [senha2, setSenha2] = useState(""); const [msg, setMsg] = useState(""); const [ocupado, setOcupado] = useState(false);
  useEffect(() => { if (!sb) { setEstado("sem-sessao"); return; } sb.auth.getUser().then(({ data }) => { setEmail(data.user?.email ?? ""); setEstado(data.user ? "ok" : "sem-sessao"); }); }, [sb]);
  if (!nuvemConfigurada() || !sb) return <section className="auth"><div className="auth-in"><div className="sinal alerta">Conta ainda não está ativa neste ambiente.</div></div></section>;
  const salvar = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg("");
    if (senha !== senha2) { setMsg("As senhas não conferem."); return; }
    setOcupado(true);
    const { error } = await sb.auth.updateUser({ password: senha });
    setOcupado(false);
    if (error) { setMsg(traduz(error.message)); return; }
    location.href = "/app/buscar";
  };
  return (
    <section className="auth"><div className="auth-in">
      <p className="eyebrow auth-eyebrow">Sua conta</p>
      <h1>Senha nova</h1>
      {estado === "checando" ? null : estado === "sem-sessao" ? (<>
        <div className="sinal alerta">Esse link expirou ou já foi usado. Peça outro em <Link href="/recuperar" style={{ textDecoration: "underline" }}>recuperar a senha</Link>.</div>
      </>) : (
        <form onSubmit={salvar} className="auth-card">
          <p style={{ margin: 0, fontSize: 14, color: "var(--mute)" }}>Defina a senha nova para <b style={{ color: "var(--ink)" }}>{email}</b>.</p>
          <label className="campo"><span>Senha nova (mínimo 6 caracteres)</span><input type="password" autoComplete="new-password" required minLength={6} value={senha} onChange={(e) => setSenha(e.target.value)} /></label>
          <label className="campo"><span>Repita a senha</span><input type="password" autoComplete="new-password" required minLength={6} value={senha2} onChange={(e) => setSenha2(e.target.value)} /></label>
          {msg && <div className="sinal alerta">{msg}</div>}
          <button className="btn ouro" type="submit" disabled={ocupado}>{ocupado ? "Aguarde…" : "Salvar senha e entrar"}</button>
        </form>)}
    </div></section>
  );
}
