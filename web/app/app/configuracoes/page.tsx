"use client";
import { useState } from "react";
import Link from "next/link";
import { useTema } from "@/lib/tema";
import { useConta } from "@/lib/conta";
export default function Config() {
  const { tema, aplicar } = useTema(); const { user, nuvem, sb, sair } = useConta();
  const [senha, setSenha] = useState(""); const [msg, setMsg] = useState("");
  const trocarSenha = async () => { if (!sb || senha.length < 6) { setMsg("A senha precisa ter pelo menos 6 caracteres."); return; } const { error } = await sb.auth.updateUser({ password: senha }); setMsg(error ? error.message : "Senha atualizada."); if (!error) setSenha(""); };
  return (<>
    <div className="app-cab"><div><h1>Configurações</h1><p>{user ? "Sua conta e as preferências deste navegador." : "Preferências deste navegador. Com conta, favoritos, padrão e pipeline seguem você em qualquer aparelho."}</p></div></div>
    <div className="painel" style={{ marginBottom: 18 }}>
      <h2>Conta</h2>
      {user ? (<>
        <p style={{ fontSize: 14, margin: "0 0 12px" }}>Você está entrando como <b>{user.email}</b>. Favoritos, padrão, pipeline e análises são sincronizados.</p>
        <div className="par" style={{ maxWidth: 520 }}><label className="campo"><span>Nova senha</span><input type="password" autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} /></label><div className="campo" style={{ justifyContent: "end" }}><button className="btn sec" onClick={trocarSenha}>Trocar senha</button></div></div>
        {msg && <p style={{ fontSize: 13, color: "var(--mute)", margin: "8px 0 0" }}>{msg}</p>}
        <p style={{ margin: "14px 0 0" }}><button className="btn sec" onClick={sair}>Sair da conta</button></p>
      </>) : nuvem ? (<>
        <p style={{ fontSize: 14, margin: "0 0 12px", color: "var(--mute)" }}>Sem conta, tudo fica só neste navegador. Ao entrar, o que já está aqui sobe junto.</p>
        <Link href="/entrar?next=/app/configuracoes" className="btn ouro">Entrar ou criar conta</Link>
      </>) : <p style={{ fontSize: 14, color: "var(--mute)", margin: 0 }}>Conta ainda não está ativa neste ambiente.</p>}
    </div>
    <div className="doisdois">
      <div className="painel"><h2>Aparência</h2><label className="campo" style={{ maxWidth: 240 }}><span>Tema</span><select value={tema} onChange={(e) => aplicar(e.target.value as "light" | "dark" | "system")}><option value="system">Sistema</option><option value="light">Claro</option><option value="dark">Escuro</option></select></label>
        <h2 style={{ marginTop: 18 }}>Dados locais</h2><p style={{ fontSize: 14, color: "var(--mute)" }}>{user ? "Cópia local dos seus dados. Apagar aqui não apaga a conta: ao recarregar, tudo volta da nuvem." : "Favoritos, pipeline, custos editados e análises de IA ficam salvos neste navegador."}</p><button className="btn sec" onClick={() => { if (confirm("Apagar favoritos, pipeline e análises salvas neste navegador?")) { Object.keys(localStorage).filter((k) => k.startsWith("garimpo:")).forEach((k) => localStorage.removeItem(k)); location.reload(); } }}>Apagar dados locais</button></div>
      <div className="painel"><h2>Meu padrão</h2><p style={{ fontSize: 14, color: "var(--mute)" }}>Faixa, deságio, margem, região, tipos, vetos e custos são definidos por você em <a href="/app/padrao" style={{ textDecoration: "underline", color: "var(--ink)" }}>Meu padrão</a>. Pode ter vários e trocar o ativo na Busca.</p></div>
    </div>
  </>);
}
