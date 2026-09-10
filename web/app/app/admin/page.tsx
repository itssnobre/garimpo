"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Portao from "@/components/Portao";
import { useConta } from "@/lib/conta";
import { META } from "@/lib/meta";
import { pct, fmtLang } from "@/lib/fmt";
import type { UsuarioAdmin } from "@/app/api/admin/usuarios/route";
import type { Padrao } from "@/lib/padrao";
import { useT } from "@/lib/i18n/client";
import type { T as Trad } from "@/lib/i18n";

const loc = () => (fmtLang() === "en" ? "en-US" : "pt-BR");
type Msg = { ok: boolean; txt: string } | null;
const dt = (s: string | null, t: Trad) => (s ? new Date(s).toLocaleString(loc(), { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : t("nunca"));
async function api<T>(url: string, init?: RequestInit, t: Trad = (s) => s): Promise<T> {
  const r = await fetch(url, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.erro ?? t("Erro {status}", { status: r.status })); return d as T;
}

function Conteudo() {
  const { t } = useT();
  const { user } = useConta();
  const [lista, setLista] = useState<UsuarioAdmin[]>([]); const [outros, setOutros] = useState(0); const [erro, setErro] = useState(""); const [carregando, setCarregando] = useState(true);
  const [aberto, setAberto] = useState<UsuarioAdmin | null>(null); const [criando, setCriando] = useState(false); const [busca, setBusca] = useState("");
  const recarregar = useCallback(async () => { setCarregando(true); try { const d = await api<{ usuarios: UsuarioAdmin[]; outrosNoProjeto: number }>("/api/admin/usuarios", undefined, t); setLista(d.usuarios); setOutros(d.outrosNoProjeto); setErro(""); } catch (e) { setErro((e as Error).message); } finally { setCarregando(false); } }, [t]);
  useEffect(() => { recarregar(); }, [recarregar]);
  const q = busca.trim().toLowerCase();
  const filtrados = lista.filter((u) => !q || `${u.email} ${u.nome}`.toLowerCase().includes(q));
  const semana = new Date(Date.now() - 7 * 864e5).toISOString();
  const gerado = new Date(META.gerado_em).toLocaleString(loc(), { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  return (<>
    <div className="app-cab"><div><h1>{t("Administração")}</h1><p>{t("Contas da plataforma, padrões de cada cliente e estado da base. Só administradores veem esta página.")}</p></div><button className="btn ouro" onClick={() => setCriando(true)}>{t("Nova conta")}</button></div>
    <div className="stats">
      <div className="stat"><b>{lista.length}</b><span>{t("contas")}</span></div>
      <div className="stat"><b>{lista.filter((u) => u.criado_em >= semana).length}</b><span>{t("novas em 7 dias")}</span></div>
      <div className="stat"><b>{lista.filter((u) => u.ultimo_login && u.ultimo_login >= semana).length}</b><span>{t("ativas em 7 dias")}</span></div>
      <div className="stat"><b>{lista.reduce((s, u) => s + u.padroes.length, 0)}</b><span>{t("padrões criados")}</span></div>
      <div className="stat"><b>{lista.filter((u) => u.bloqueado).length}</b><span>{t("bloqueadas")}</span></div>
    </div>
    <div className="painel" style={{ marginBottom: 18 }}>
      <h2>{t("Base de lotes")}</h2>
      <p style={{ fontSize: 14, color: "var(--mute)", margin: 0 }}>{t("{n} lotes de {f} fontes em {e} estados. Última coleta {gerado}.", { n: META.total.toLocaleString(loc()), f: Object.keys(META.fontes).length, e: Object.keys(META.por_uf ?? {}).length, gerado })} {t("A coleta roda fora do site (scripts Python); ver")} <Link href="/app/cobertura" style={{ textDecoration: "underline" }}>{t("Cobertura")}</Link>.</p>
    </div>
    {erro && <div className="sinal alerta" style={{ marginBottom: 12 }}>{erro}</div>}
    <div className="painel" style={{ overflowX: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>{t("Contas")}</h2>
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder={t("Buscar por e-mail ou nome")} style={{ maxWidth: 280 }} aria-label={t("Buscar conta")} />
      </div>
      {carregando && lista.length === 0 ? <p style={{ color: "var(--mute)" }}>{t("Carregando…")}</p> : (
        <table className="tabela"><thead><tr><th>{t("Conta")}</th><th>{t("Papel")}</th><th>{t("Padrões")}</th><th className="num">{t("Favoritos")}</th><th className="num">{t("Pipeline")}</th><th>{t("Último acesso")}</th><th>{t("Estado")}</th><th></th></tr></thead>
          <tbody>{filtrados.map((u) => (
            <tr key={u.id} style={{ opacity: u.bloqueado ? 0.6 : 1 }}>
              <td><b>{u.nome || t("(sem nome)")}</b>{u.id === user?.id && <span className="badge" style={{ marginLeft: 6 }}>{t("você")}</span>}<br /><span className="sub">{u.email}</span></td>
              <td>{u.papel === "admin" ? <span className="badge go">{t("admin")}</span> : <span className="badge">{t("cliente")}</span>}</td>
              <td style={{ maxWidth: 220, whiteSpace: "normal", fontSize: 13 }}>{u.padroes.length ? u.padroes.join(", ") : <span className="sub">{t("nenhum")}</span>}</td>
              <td className="num">{u.favoritos}</td><td className="num">{u.pipeline}</td>
              <td style={{ fontSize: 13 }}>{dt(u.ultimo_login, t)}<br /><span className="sub">{t("criada {v}", { v: dt(u.criado_em, t) })}</span></td>
              <td style={{ fontSize: 13 }}>{u.bloqueado ? <span className="badge nogo">{t("bloqueada")}</span> : u.confirmado ? <span className="badge go">{t("ativa")}</span> : <span className="badge atencao">{t("e-mail não confirmado")}</span>}</td>
              <td><button className="btn sec mini" onClick={() => setAberto(u)}>{t("Gerenciar")}</button></td>
            </tr>))}</tbody></table>)}
      {outros > 0 && <p style={{ fontSize: 12.5, color: "var(--mute)", marginTop: 12 }}>{t("Há {n} usuário(s) no projeto Supabase sem perfil na Lotwise (outros apps). Eles não aparecem aqui.", { n: outros })}</p>}
    </div>
    {aberto && <Gerenciar u={aberto} eu={user?.id ?? ""} fechar={() => setAberto(null)} mudou={() => { recarregar(); }} />}
    {criando && <NovaConta fechar={() => setCriando(false)} mudou={() => { recarregar(); }} />}
  </>);
}

function Folha({ titulo, fechar, children }: { titulo: string; fechar: () => void; children: React.ReactNode }) {
  const { t } = useT();
  useEffect(() => { document.body.classList.add("travado"); return () => document.body.classList.remove("travado"); }, []);
  return (<><div className="fpanel-fundo gaveta" onClick={fechar} /><div className="fpanel gaveta" role="dialog" aria-label={titulo}>
    <div className="fpanel-cab"><b>{titulo}</b><button className="btn ghost mini" onClick={fechar} aria-label={t("Fechar")}>✕</button></div>
    <div className="fpanel-corpo">{children}</div>
  </div></>);
}
const Aviso = ({ m }: { m: Msg }) => (m ? <div className={`sinal ${m.ok ? "info" : "alerta"}`} style={{ marginTop: 10 }}>{m.txt}</div> : null);

function Gerenciar({ u, eu, fechar, mudou }: { u: UsuarioAdmin; eu: string; fechar: () => void; mudou: () => void }) {
  const { t } = useT();
  const [nome, setNome] = useState(u.nome); const [email, setEmail] = useState(u.email); const [senha, setSenha] = useState(""); const [papel, setPapel] = useState(u.papel);
  const [msg, setMsg] = useState<Msg>(null); const [ocupado, setOcupado] = useState(false); const [bloqueado, setBloqueado] = useState(u.bloqueado);
  const [padroes, setPadroes] = useState<{ id: string; dados: Padrao; ativo: boolean }[] | null>(null); const [confirmaApagar, setConfirmaApagar] = useState("");
  useEffect(() => { api<{ padroes: { id: string; dados: Padrao; ativo: boolean }[] }>(`/api/admin/usuarios/${u.id}`, undefined, t).then((d) => setPadroes(d.padroes)).catch(() => setPadroes([])); }, [u.id, t]);
  const patch = async (b: Record<string, unknown>, okTxt: string) => { setOcupado(true); setMsg(null); try { await api(`/api/admin/usuarios/${u.id}`, { method: "PATCH", body: JSON.stringify(b) }, t); setMsg({ ok: true, txt: okTxt }); mudou(); } catch (e) { setMsg({ ok: false, txt: (e as Error).message }); } finally { setOcupado(false); } };
  const souEu = u.id === eu;
  const APAGAR = t("APAGAR");
  return (
    <Folha titulo={u.nome || u.email} fechar={fechar}>
      <div className="fgrupo"><h4>{t("Dados da conta")}</h4>
        <label className="campo"><span>{t("Nome")}</span><input value={nome} onChange={(e) => setNome(e.target.value)} /></label>
        <label className="campo" style={{ marginTop: 8 }}><span>{t("E-mail de acesso")}</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <p style={{ margin: "10px 0 0" }}><button className="btn sec mini" disabled={ocupado} onClick={() => patch({ nome, ...(email !== u.email ? { email } : {}) }, t("Dados salvos."))}>{t("Salvar dados")}</button></p>
      </div>
      <div className="fgrupo"><h4>{t("Senha")}</h4>
        <p style={{ margin: "0 0 8px", fontSize: 12.5, color: "var(--mute)" }}>{t("Define uma senha nova na hora, sem e-mail. Entregue para a pessoa e peça para trocar em Configurações.")}</p>
        <label className="campo"><span>{t("Senha nova (mínimo 6)")}</span><input type="text" autoComplete="off" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder={t("ex.: Lotwise2026")} /></label>
        <p style={{ margin: "10px 0 0" }}><button className="btn sec mini" disabled={ocupado || senha.length < 6} onClick={() => patch({ senha }, t("Senha redefinida.")).then(() => setSenha(""))}>{t("Redefinir senha")}</button></p>
      </div>
      <div className="fgrupo"><h4>{t("Papel e acesso")}</h4>
        <div className="fopcoes">{(["cliente", "admin"] as const).map((p) => <button key={p} className={`fopcao ${papel === p ? "on" : ""}`} disabled={souEu} onClick={() => { setPapel(p); patch({ papel: p }, p === "admin" ? t("Agora é administrador.") : t("Agora é cliente.")); }}>{t(p === "admin" ? "admin" : "cliente")}</button>)}</div>
        <label className="toggle" style={{ marginTop: 10 }}><input type="checkbox" checked={bloqueado} disabled={souEu} onChange={(e) => { setBloqueado(e.target.checked); patch({ bloqueado: e.target.checked }, e.target.checked ? t("Conta bloqueada: não consegue mais entrar.") : t("Conta desbloqueada.")); }} />{t("Bloquear acesso")}</label>
        {souEu && <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "var(--mute)" }}>{t("Papel e bloqueio da própria conta não se mudam por aqui.")}</p>}
      </div>
      <div className="fgrupo"><h4>{t("Padrões deste cliente")}</h4>
        {padroes === null ? <p className="sub">{t("Carregando…")}</p> : padroes.length === 0 ? <p className="sub" style={{ margin: 0 }}>{t("Ainda não criou nenhum padrão.")}</p> : padroes.map((p) => {
          const faixaTxt = p.dados.faixaMin || p.dados.faixaMax
            ? `${p.dados.faixaMin ? t("de R$ {v}", { v: p.dados.faixaMin.toLocaleString(loc()) }) : ""} ${p.dados.faixaMax ? t("até R$ {v}", { v: p.dados.faixaMax.toLocaleString(loc()) }) : ""}`.trim()
            : t("sem faixa");
          return (
          <div key={p.id} className="painel" style={{ padding: 12, marginBottom: 8 }}>
            <b>{p.dados.nome}</b>{p.ativo && <span className="badge go" style={{ marginLeft: 6 }}>{t("ativo")}</span>}
            <dl className="kv" style={{ marginTop: 6 }}><dt>{t("Avaliação")}</dt><dd>{faixaTxt}</dd><dt>{t("Deságio")}</dt><dd>&ge; {pct(p.dados.desagioMin)}</dd><dt>{t("Margem")}</dt><dd>&ge; {pct(p.dados.margemMin)} {t("(alvo {v})", { v: pct(p.dados.margemAlvo) })}</dd><dt>{t("Região")}</dt><dd style={{ whiteSpace: "normal", fontFamily: "var(--f-body)" }}>{[...p.dados.ufs, ...p.dados.cidades].join(", ") || t("Brasil")}</dd><dt>{t("Tipos")}</dt><dd style={{ whiteSpace: "normal", fontFamily: "var(--f-body)" }}>{p.dados.tipos.join(", ") || t("todos")}</dd></dl>
          </div>);
        })}
      </div>
      {!souEu && <div className="fgrupo"><h4 style={{ color: "var(--bad)" }}>{t("Apagar conta")}</h4>
        <p style={{ margin: "0 0 8px", fontSize: 12.5, color: "var(--mute)" }}>{t("Apaga a conta e tudo dela (padrões, favoritos, pipeline, análises). Sem volta.")}</p>
        <label className="campo"><span>{t("Digite {palavra}", { palavra: APAGAR })}</span><input value={confirmaApagar} onChange={(e) => setConfirmaApagar(e.target.value)} /></label>
        <p style={{ margin: "10px 0 0" }}><button className="btn sec mini" style={{ color: "var(--bad)" }} disabled={ocupado || confirmaApagar !== APAGAR} onClick={async () => { setOcupado(true); try { await api(`/api/admin/usuarios/${u.id}`, { method: "DELETE" }, t); mudou(); fechar(); } catch (e) { setMsg({ ok: false, txt: (e as Error).message }); setOcupado(false); } }}>{t("Apagar esta conta")}</button></p>
      </div>}
      <Aviso m={msg} />
    </Folha>);
}

function NovaConta({ fechar, mudou }: { fechar: () => void; mudou: () => void }) {
  const { t } = useT();
  const [nome, setNome] = useState(""); const [email, setEmail] = useState(""); const [senha, setSenha] = useState(""); const [papel, setPapel] = useState<"cliente" | "admin">("cliente");
  const [msg, setMsg] = useState<Msg>(null); const [ocupado, setOcupado] = useState(false);
  const criar = async () => { setOcupado(true); setMsg(null); try { await api("/api/admin/usuarios", { method: "POST", body: JSON.stringify({ nome, email, senha, papel }) }, t); setMsg({ ok: true, txt: t("Conta criada e já confirmada. Entregue: {email} / {senha}", { email, senha }) }); mudou(); } catch (e) { setMsg({ ok: false, txt: (e as Error).message }); } finally { setOcupado(false); } };
  return (
    <Folha titulo={t("Nova conta")} fechar={fechar}>
      <div className="fgrupo">
        <p style={{ margin: "0 0 10px", fontSize: 12.5, color: "var(--mute)" }}>{t("A conta nasce confirmada, sem e-mail de verificação. Você entrega e-mail e senha e a pessoa cria o padrão dela ao entrar.")}</p>
        <label className="campo"><span>{t("Nome")}</span><input value={nome} onChange={(e) => setNome(e.target.value)} placeholder={t("ex.: Lucinei")} /></label>
        <label className="campo" style={{ marginTop: 8 }}><span>{t("E-mail")}</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="campo" style={{ marginTop: 8 }}><span>{t("Senha inicial (mínimo 6)")}</span><input type="text" autoComplete="off" value={senha} onChange={(e) => setSenha(e.target.value)} /></label>
        <h4 style={{ marginTop: 14 }}>{t("Papel")}</h4>
        <div className="fopcoes">{(["cliente", "admin"] as const).map((p) => <button key={p} className={`fopcao ${papel === p ? "on" : ""}`} onClick={() => setPapel(p)}>{t(p === "admin" ? "admin" : "cliente")}</button>)}</div>
        <p style={{ margin: "14px 0 0" }}><button className="btn ouro" disabled={ocupado || !email || senha.length < 6} onClick={criar}>{t("Criar conta")}</button></p>
        <Aviso m={msg} />
      </div>
    </Folha>);
}

export default function Admin() { const { t } = useT(); return <Portao titulo={t("Administração")} admin><Conteudo /></Portao>; }
