"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Portao from "@/components/Portao";
import { useConta } from "@/lib/conta";
import { META } from "@/lib/meta";
import { pct } from "@/lib/fmt";
import type { UsuarioAdmin } from "@/app/api/admin/usuarios/route";
import type { Padrao } from "@/lib/padrao";

type Msg = { ok: boolean; txt: string } | null;
const dt = (s: string | null) => (s ? new Date(s).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "nunca");
async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.erro ?? `Erro ${r.status}`); return d as T;
}

function Conteudo() {
  const { user } = useConta();
  const [lista, setLista] = useState<UsuarioAdmin[]>([]); const [outros, setOutros] = useState(0); const [erro, setErro] = useState(""); const [carregando, setCarregando] = useState(true);
  const [aberto, setAberto] = useState<UsuarioAdmin | null>(null); const [criando, setCriando] = useState(false); const [busca, setBusca] = useState("");
  const recarregar = useCallback(async () => { setCarregando(true); try { const d = await api<{ usuarios: UsuarioAdmin[]; outrosNoProjeto: number }>("/api/admin/usuarios"); setLista(d.usuarios); setOutros(d.outrosNoProjeto); setErro(""); } catch (e) { setErro((e as Error).message); } finally { setCarregando(false); } }, []);
  useEffect(() => { recarregar(); }, [recarregar]);
  const q = busca.trim().toLowerCase();
  const filtrados = lista.filter((u) => !q || `${u.email} ${u.nome}`.toLowerCase().includes(q));
  const semana = new Date(Date.now() - 7 * 864e5).toISOString();
  const gerado = new Date(META.gerado_em).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  return (<>
    <div className="app-cab"><div><h1>Administração</h1><p>Contas da plataforma, padrões de cada cliente e estado da base. Só administradores veem esta página.</p></div><button className="btn ouro" onClick={() => setCriando(true)}>Nova conta</button></div>
    <div className="stats">
      <div className="stat"><b>{lista.length}</b><span>contas</span></div>
      <div className="stat"><b>{lista.filter((u) => u.criado_em >= semana).length}</b><span>novas em 7 dias</span></div>
      <div className="stat"><b>{lista.filter((u) => u.ultimo_login && u.ultimo_login >= semana).length}</b><span>ativas em 7 dias</span></div>
      <div className="stat"><b>{lista.reduce((s, u) => s + u.padroes.length, 0)}</b><span>padrões criados</span></div>
      <div className="stat"><b>{lista.filter((u) => u.bloqueado).length}</b><span>bloqueadas</span></div>
    </div>
    <div className="painel" style={{ marginBottom: 18 }}>
      <h2>Base de lotes</h2>
      <p style={{ fontSize: 14, color: "var(--mute)", margin: 0 }}>{META.total.toLocaleString("pt-BR")} lotes de {Object.keys(META.fontes).length} fontes em {Object.keys(META.por_uf ?? {}).length} estados. Última coleta {gerado}. A coleta roda fora do site (scripts Python); ver <Link href="/app/cobertura" style={{ textDecoration: "underline" }}>Cobertura</Link>.</p>
    </div>
    {erro && <div className="sinal alerta" style={{ marginBottom: 12 }}>{erro}</div>}
    <div className="painel" style={{ overflowX: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Contas</h2>
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por e-mail ou nome" style={{ maxWidth: 280 }} aria-label="Buscar conta" />
      </div>
      {carregando && lista.length === 0 ? <p style={{ color: "var(--mute)" }}>Carregando…</p> : (
        <table className="tabela"><thead><tr><th>Conta</th><th>Papel</th><th>Padrões</th><th className="num">Favoritos</th><th className="num">Pipeline</th><th>Último acesso</th><th>Estado</th><th></th></tr></thead>
          <tbody>{filtrados.map((u) => (
            <tr key={u.id} style={{ opacity: u.bloqueado ? 0.6 : 1 }}>
              <td><b>{u.nome || "(sem nome)"}</b>{u.id === user?.id && <span className="badge" style={{ marginLeft: 6 }}>você</span>}<br /><span className="sub">{u.email}</span></td>
              <td>{u.papel === "admin" ? <span className="badge go">admin</span> : <span className="badge">cliente</span>}</td>
              <td style={{ maxWidth: 220, whiteSpace: "normal", fontSize: 13 }}>{u.padroes.length ? u.padroes.join(", ") : <span className="sub">nenhum</span>}</td>
              <td className="num">{u.favoritos}</td><td className="num">{u.pipeline}</td>
              <td style={{ fontSize: 13 }}>{dt(u.ultimo_login)}<br /><span className="sub">criada {dt(u.criado_em)}</span></td>
              <td style={{ fontSize: 13 }}>{u.bloqueado ? <span className="badge nogo">bloqueada</span> : u.confirmado ? <span className="badge go">ativa</span> : <span className="badge atencao">e-mail não confirmado</span>}</td>
              <td><button className="btn sec mini" onClick={() => setAberto(u)}>Gerenciar</button></td>
            </tr>))}</tbody></table>)}
      {outros > 0 && <p style={{ fontSize: 12.5, color: "var(--mute)", marginTop: 12 }}>Há {outros} usuário(s) no projeto Supabase sem perfil na Lotwise (outros apps). Eles não aparecem aqui.</p>}
    </div>
    {aberto && <Gerenciar u={aberto} eu={user?.id ?? ""} fechar={() => setAberto(null)} mudou={() => { recarregar(); }} />}
    {criando && <NovaConta fechar={() => setCriando(false)} mudou={() => { recarregar(); }} />}
  </>);
}

function Folha({ titulo, fechar, children }: { titulo: string; fechar: () => void; children: React.ReactNode }) {
  useEffect(() => { document.body.classList.add("travado"); return () => document.body.classList.remove("travado"); }, []);
  return (<><div className="fpanel-fundo gaveta" onClick={fechar} /><div className="fpanel gaveta" role="dialog" aria-label={titulo}>
    <div className="fpanel-cab"><b>{titulo}</b><button className="btn ghost mini" onClick={fechar} aria-label="Fechar">✕</button></div>
    <div className="fpanel-corpo">{children}</div>
  </div></>);
}
const Aviso = ({ m }: { m: Msg }) => (m ? <div className={`sinal ${m.ok ? "info" : "alerta"}`} style={{ marginTop: 10 }}>{m.txt}</div> : null);

function Gerenciar({ u, eu, fechar, mudou }: { u: UsuarioAdmin; eu: string; fechar: () => void; mudou: () => void }) {
  const [nome, setNome] = useState(u.nome); const [email, setEmail] = useState(u.email); const [senha, setSenha] = useState(""); const [papel, setPapel] = useState(u.papel);
  const [msg, setMsg] = useState<Msg>(null); const [ocupado, setOcupado] = useState(false); const [bloqueado, setBloqueado] = useState(u.bloqueado);
  const [padroes, setPadroes] = useState<{ id: string; dados: Padrao; ativo: boolean }[] | null>(null); const [confirmaApagar, setConfirmaApagar] = useState("");
  useEffect(() => { api<{ padroes: { id: string; dados: Padrao; ativo: boolean }[] }>(`/api/admin/usuarios/${u.id}`).then((d) => setPadroes(d.padroes)).catch(() => setPadroes([])); }, [u.id]);
  const patch = async (b: Record<string, unknown>, okTxt: string) => { setOcupado(true); setMsg(null); try { await api(`/api/admin/usuarios/${u.id}`, { method: "PATCH", body: JSON.stringify(b) }); setMsg({ ok: true, txt: okTxt }); mudou(); } catch (e) { setMsg({ ok: false, txt: (e as Error).message }); } finally { setOcupado(false); } };
  const souEu = u.id === eu;
  return (
    <Folha titulo={u.nome || u.email} fechar={fechar}>
      <div className="fgrupo"><h4>Dados da conta</h4>
        <label className="campo"><span>Nome</span><input value={nome} onChange={(e) => setNome(e.target.value)} /></label>
        <label className="campo" style={{ marginTop: 8 }}><span>E-mail de acesso</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <p style={{ margin: "10px 0 0" }}><button className="btn sec mini" disabled={ocupado} onClick={() => patch({ nome, ...(email !== u.email ? { email } : {}) }, "Dados salvos.")}>Salvar dados</button></p>
      </div>
      <div className="fgrupo"><h4>Senha</h4>
        <p style={{ margin: "0 0 8px", fontSize: 12.5, color: "var(--mute)" }}>Define uma senha nova na hora, sem e-mail. Entregue para a pessoa e peça para trocar em Configurações.</p>
        <label className="campo"><span>Senha nova (mínimo 6)</span><input type="text" autoComplete="off" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="ex.: Lotwise2026" /></label>
        <p style={{ margin: "10px 0 0" }}><button className="btn sec mini" disabled={ocupado || senha.length < 6} onClick={() => patch({ senha }, "Senha redefinida.").then(() => setSenha(""))}>Redefinir senha</button></p>
      </div>
      <div className="fgrupo"><h4>Papel e acesso</h4>
        <div className="fopcoes">{(["cliente", "admin"] as const).map((p) => <button key={p} className={`fopcao ${papel === p ? "on" : ""}`} disabled={souEu} onClick={() => { setPapel(p); patch({ papel: p }, p === "admin" ? "Agora é administrador." : "Agora é cliente."); }}>{p}</button>)}</div>
        <label className="toggle" style={{ marginTop: 10 }}><input type="checkbox" checked={bloqueado} disabled={souEu} onChange={(e) => { setBloqueado(e.target.checked); patch({ bloqueado: e.target.checked }, e.target.checked ? "Conta bloqueada: não consegue mais entrar." : "Conta desbloqueada."); }} />Bloquear acesso</label>
        {souEu && <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "var(--mute)" }}>Papel e bloqueio da própria conta não se mudam por aqui.</p>}
      </div>
      <div className="fgrupo"><h4>Padrões deste cliente</h4>
        {padroes === null ? <p className="sub">Carregando…</p> : padroes.length === 0 ? <p className="sub" style={{ margin: 0 }}>Ainda não criou nenhum padrão.</p> : padroes.map((p) => (
          <div key={p.id} className="painel" style={{ padding: 12, marginBottom: 8 }}>
            <b>{p.dados.nome}</b>{p.ativo && <span className="badge go" style={{ marginLeft: 6 }}>ativo</span>}
            <dl className="kv" style={{ marginTop: 6 }}><dt>Avaliação</dt><dd>{p.dados.faixaMin || p.dados.faixaMax ? `${p.dados.faixaMin ? "de R$ " + p.dados.faixaMin.toLocaleString("pt-BR") : ""} ${p.dados.faixaMax ? "até R$ " + p.dados.faixaMax.toLocaleString("pt-BR") : ""}` : "sem faixa"}</dd><dt>Deságio</dt><dd>≥ {pct(p.dados.desagioMin)}</dd><dt>Margem</dt><dd>≥ {pct(p.dados.margemMin)} (alvo {pct(p.dados.margemAlvo)})</dd><dt>Região</dt><dd style={{ whiteSpace: "normal", fontFamily: "var(--f-body)" }}>{[...p.dados.ufs, ...p.dados.cidades].join(", ") || "Brasil"}</dd><dt>Tipos</dt><dd style={{ whiteSpace: "normal", fontFamily: "var(--f-body)" }}>{p.dados.tipos.join(", ") || "todos"}</dd></dl>
          </div>))}
      </div>
      {!souEu && <div className="fgrupo"><h4 style={{ color: "var(--bad)" }}>Apagar conta</h4>
        <p style={{ margin: "0 0 8px", fontSize: 12.5, color: "var(--mute)" }}>Apaga a conta e tudo dela (padrões, favoritos, pipeline, análises). Sem volta.</p>
        <label className="campo"><span>Digite APAGAR</span><input value={confirmaApagar} onChange={(e) => setConfirmaApagar(e.target.value)} /></label>
        <p style={{ margin: "10px 0 0" }}><button className="btn sec mini" style={{ color: "var(--bad)" }} disabled={ocupado || confirmaApagar !== "APAGAR"} onClick={async () => { setOcupado(true); try { await api(`/api/admin/usuarios/${u.id}`, { method: "DELETE" }); mudou(); fechar(); } catch (e) { setMsg({ ok: false, txt: (e as Error).message }); setOcupado(false); } }}>Apagar esta conta</button></p>
      </div>}
      <Aviso m={msg} />
    </Folha>);
}

function NovaConta({ fechar, mudou }: { fechar: () => void; mudou: () => void }) {
  const [nome, setNome] = useState(""); const [email, setEmail] = useState(""); const [senha, setSenha] = useState(""); const [papel, setPapel] = useState<"cliente" | "admin">("cliente");
  const [msg, setMsg] = useState<Msg>(null); const [ocupado, setOcupado] = useState(false);
  const criar = async () => { setOcupado(true); setMsg(null); try { await api("/api/admin/usuarios", { method: "POST", body: JSON.stringify({ nome, email, senha, papel }) }); setMsg({ ok: true, txt: `Conta criada e já confirmada. Entregue: ${email} / ${senha}` }); mudou(); } catch (e) { setMsg({ ok: false, txt: (e as Error).message }); } finally { setOcupado(false); } };
  return (
    <Folha titulo="Nova conta" fechar={fechar}>
      <div className="fgrupo">
        <p style={{ margin: "0 0 10px", fontSize: 12.5, color: "var(--mute)" }}>A conta nasce confirmada, sem e-mail de verificação. Você entrega e-mail e senha e a pessoa cria o padrão dela ao entrar.</p>
        <label className="campo"><span>Nome</span><input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="ex.: Lucinei" /></label>
        <label className="campo" style={{ marginTop: 8 }}><span>E-mail</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="campo" style={{ marginTop: 8 }}><span>Senha inicial (mínimo 6)</span><input type="text" autoComplete="off" value={senha} onChange={(e) => setSenha(e.target.value)} /></label>
        <h4 style={{ marginTop: 14 }}>Papel</h4>
        <div className="fopcoes">{(["cliente", "admin"] as const).map((p) => <button key={p} className={`fopcao ${papel === p ? "on" : ""}`} onClick={() => setPapel(p)}>{p}</button>)}</div>
        <p style={{ margin: "14px 0 0" }}><button className="btn ouro" disabled={ocupado || !email || senha.length < 6} onClick={criar}>Criar conta</button></p>
        <Aviso m={msg} />
      </div>
    </Folha>);
}

export default function Admin() { return <Portao titulo="Administração" admin><Conteudo /></Portao>; }
