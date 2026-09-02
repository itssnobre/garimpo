"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useTema } from "@/lib/tema";
import { useConta } from "@/lib/conta";
import { traduz } from "@/lib/authErros";

type Msg = { ok: boolean; txt: string } | null;
export default function Config() {
  const { tema, aplicar } = useTema(); const { user, perfil, nuvem, sb, sair, recarregarPerfil } = useConta();
  const [nome, setNome] = useState(""); const [email, setEmail] = useState("");
  const [senhaAtual, setSenhaAtual] = useState(""); const [senha, setSenha] = useState(""); const [senha2, setSenha2] = useState("");
  const [msgPerfil, setMsgPerfil] = useState<Msg>(null); const [msgEmail, setMsgEmail] = useState<Msg>(null); const [msgSenha, setMsgSenha] = useState<Msg>(null); const [msgExcluir, setMsgExcluir] = useState<Msg>(null);
  const [confirmaExcluir, setConfirmaExcluir] = useState("");
  useEffect(() => { setNome(perfil?.nome ?? ""); setEmail(user?.email ?? ""); }, [perfil?.nome, user?.email]);

  const salvarNome = async () => {
    if (!sb || !user) return; if (nome.trim().length < 2) { setMsgPerfil({ ok: false, txt: "Diga como quer ser chamado." }); return; }
    const { error } = await sb.from("lotwise_perfis").update({ nome: nome.trim() }).eq("user_id", user.id);
    if (!error) await sb.auth.updateUser({ data: { nome: nome.trim() } });
    setMsgPerfil(error ? { ok: false, txt: error.message } : { ok: true, txt: "Nome atualizado." }); if (!error) recarregarPerfil();
  };
  const trocarEmail = async () => {
    if (!sb || !user) return; const novo = email.trim().toLowerCase();
    if (!novo || novo === user.email) { setMsgEmail({ ok: false, txt: "Informe um e-mail diferente do atual." }); return; }
    const { error } = await sb.auth.updateUser({ email: novo }, { emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent("/app/configuracoes")}` });
    setMsgEmail(error ? { ok: false, txt: traduz(error.message) } : { ok: true, txt: `Enviamos um link de confirmação para ${novo}. O e-mail só muda depois que você confirmar por lá.` });
  };
  const trocarSenha = async () => {
    if (!sb || !user?.email) return;
    if (senha.length < 6) { setMsgSenha({ ok: false, txt: "A senha nova precisa ter pelo menos 6 caracteres." }); return; }
    if (senha !== senha2) { setMsgSenha({ ok: false, txt: "As senhas novas não conferem." }); return; }
    // Confirma a senha atual antes de trocar: evita troca por quem só pegou o aparelho aberto.
    const { error: e1 } = await sb.auth.signInWithPassword({ email: user.email, password: senhaAtual });
    if (e1) { setMsgSenha({ ok: false, txt: "A senha atual não confere." }); return; }
    const { error } = await sb.auth.updateUser({ password: senha });
    setMsgSenha(error ? { ok: false, txt: traduz(error.message) } : { ok: true, txt: "Senha atualizada." }); if (!error) { setSenhaAtual(""); setSenha(""); setSenha2(""); }
  };
  const excluir = async () => {
    if (confirmaExcluir !== "EXCLUIR") { setMsgExcluir({ ok: false, txt: 'Digite EXCLUIR para confirmar.' }); return; }
    const r = await fetch("/api/conta", { method: "DELETE" });
    if (!r.ok) { setMsgExcluir({ ok: false, txt: (await r.json().catch(() => ({}))).erro ?? "Não consegui excluir agora." }); return; }
    try { Object.keys(localStorage).filter((k) => k.startsWith("garimpo:")).forEach((k) => localStorage.removeItem(k)); } catch {}
    await sb?.auth.signOut(); location.href = "/";
  };

  const Aviso = ({ m }: { m: Msg }) => (m ? <div className={`sinal ${m.ok ? "info" : "alerta"}`} style={{ marginTop: 10 }}>{m.txt}</div> : null);
  return (<>
    <div className="app-cab"><div><h1>Configurações</h1><p>{user ? "Sua conta e as preferências deste navegador." : "Preferências deste navegador. Com conta, seu padrão, favoritos e pipeline seguem você em qualquer aparelho."}</p></div></div>
    {user ? (<>
      <div className="doisdois" style={{ marginBottom: 18 }}>
        <div className="painel">
          <h2>Perfil</h2>
          <p style={{ fontSize: 14, margin: "0 0 12px", color: "var(--mute)" }}>Entrando como <b style={{ color: "var(--ink)" }}>{user.email}</b>{perfil?.papel === "admin" ? " · administrador" : ""}.</p>
          <label className="campo"><span>Nome</span><input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Como quer ser chamado" /></label>
          <p style={{ margin: "10px 0 0" }}><button className="btn sec" onClick={salvarNome}>Salvar nome</button></p>
          <Aviso m={msgPerfil} />
          <h2 style={{ marginTop: 22 }}>E-mail de acesso</h2>
          <label className="campo"><span>E-mail</span><input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <p style={{ margin: "10px 0 0" }}><button className="btn sec" onClick={trocarEmail}>Trocar e-mail</button></p>
          <Aviso m={msgEmail} />
        </div>
        <div className="painel">
          <h2>Senha</h2>
          <label className="campo"><span>Senha atual</span><input type="password" autoComplete="current-password" value={senhaAtual} onChange={(e) => setSenhaAtual(e.target.value)} /></label>
          <div className="par" style={{ marginTop: 10 }}>
            <label className="campo"><span>Senha nova</span><input type="password" autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} /></label>
            <label className="campo"><span>Repita a nova</span><input type="password" autoComplete="new-password" value={senha2} onChange={(e) => setSenha2(e.target.value)} /></label>
          </div>
          <p style={{ margin: "10px 0 0" }}><button className="btn sec" onClick={trocarSenha}>Trocar senha</button> <Link href="/recuperar" style={{ marginLeft: 10, fontSize: 13, textDecoration: "underline" }}>Esqueci a atual</Link></p>
          <Aviso m={msgSenha} />
          <h2 style={{ marginTop: 22 }}>Sessão</h2>
          <p style={{ margin: 0 }}><button className="btn sec" onClick={sair}>Sair da conta</button></p>
        </div>
      </div>
    </>) : (
      <div className="painel" style={{ marginBottom: 18 }}>
        <h2>Conta</h2>
        {nuvem ? (<><p style={{ fontSize: 14, margin: "0 0 12px", color: "var(--mute)" }}>Sem conta você vê só uma amostra do catálogo, sem padrão nem análise.</p><Link href="/entrar?next=/app/configuracoes" className="btn ouro">Entrar ou criar conta</Link></>)
          : <p style={{ fontSize: 14, color: "var(--mute)", margin: 0 }}>Conta ainda não está ativa neste ambiente.</p>}
      </div>)}
    <div className="doisdois">
      <div className="painel"><h2>Aparência</h2><label className="campo" style={{ maxWidth: 240 }}><span>Tema</span><select value={tema} onChange={(e) => aplicar(e.target.value as "light" | "dark" | "system")}><option value="system">Sistema</option><option value="light">Claro</option><option value="dark">Escuro</option></select></label>
        <h2 style={{ marginTop: 18 }}>Dados locais</h2><p style={{ fontSize: 14, color: "var(--mute)" }}>{user ? "Cópia local dos seus dados. Apagar aqui não apaga a conta: ao recarregar, tudo volta da nuvem." : "Preferências e cache deste navegador."}</p><button className="btn sec" onClick={() => { if (confirm("Apagar a cópia local de favoritos, pipeline e análises deste navegador?")) { Object.keys(localStorage).filter((k) => k.startsWith("garimpo:")).forEach((k) => localStorage.removeItem(k)); location.reload(); } }}>Apagar dados locais</button></div>
      <div className="painel"><h2>Meu padrão</h2><p style={{ fontSize: 14, color: "var(--mute)" }}>Faixa, deságio, margem, região, tipos, vetos e custos são definidos por você em <Link href="/app/padrao" style={{ textDecoration: "underline", color: "var(--ink)" }}>Meu padrão</Link>. Pode ter vários, com o nome que quiser, e trocar o ativo na Busca.</p>
        {user && (<>
          <h2 style={{ marginTop: 18, color: "var(--bad)" }}>Excluir conta</h2>
          <p style={{ fontSize: 14, color: "var(--mute)" }}>Apaga a conta e tudo que está nela (padrões, favoritos, pipeline, análises). Não tem volta.</p>
          <div className="par"><label className="campo"><span>Digite EXCLUIR</span><input value={confirmaExcluir} onChange={(e) => setConfirmaExcluir(e.target.value)} /></label><div className="campo" style={{ justifyContent: "end" }}><button className="btn sec" style={{ color: "var(--bad)" }} onClick={excluir}>Excluir minha conta</button></div></div>
          <Aviso m={msgExcluir} />
        </>)}
      </div>
    </div>
  </>);
}
