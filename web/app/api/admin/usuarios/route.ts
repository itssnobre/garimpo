import { NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/supabase/admin";
import { PADRAO_LOTWISE } from "@/lib/padrao";
export const runtime = "nodejs";

export interface UsuarioAdmin { id: string; email: string; nome: string; papel: "admin" | "cliente"; criado_em: string; ultimo_login: string | null; confirmado: boolean; bloqueado: boolean; padroes: string[]; favoritos: number; pipeline: number; lotes: number }

/** Lista de contas da Lotwise (só quem tem perfil lotwise_perfis: o projeto Supabase é compartilhado com outros apps). */
export async function GET() {
  const g = await exigirAdmin(); if ("erro" in g) return NextResponse.json({ erro: g.erro }, { status: g.status });
  const { admin } = g;
  const [{ data: perfis }, { data: padroes }, { data: favs }, { data: pipe }, { data: lotes }, usuarios] = await Promise.all([
    admin.from("lotwise_perfis").select("user_id,nome,papel,criado_em"),
    admin.from("lotwise_padroes").select("user_id,dados->nome"),
    admin.from("lotwise_favoritos").select("user_id"),
    admin.from("lotwise_pipeline").select("user_id"),
    admin.from("lotwise_lotes").select("user_id"),
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);
  if (usuarios.error) return NextResponse.json({ erro: usuarios.error.message }, { status: 500 });
  const conta = (rows: { user_id: string }[] | null) => { const m = new Map<string, number>(); rows?.forEach((r) => m.set(r.user_id, (m.get(r.user_id) ?? 0) + 1)); return m; };
  const nFav = conta(favs), nPipe = conta(pipe), nLotes = conta(lotes);
  const nomesPadrao = new Map<string, string[]>(); (padroes as { user_id: string; nome: string }[] | null)?.forEach((p) => nomesPadrao.set(p.user_id, [...(nomesPadrao.get(p.user_id) ?? []), p.nome ?? "(sem nome)"]));
  const perfilDe = new Map((perfis ?? []).map((p) => [p.user_id as string, p]));
  const lista: UsuarioAdmin[] = usuarios.data.users.filter((u) => perfilDe.has(u.id)).map((u) => { const p = perfilDe.get(u.id)!; return {
    id: u.id, email: u.email ?? "", nome: (p.nome as string) ?? "", papel: p.papel as "admin" | "cliente", criado_em: u.created_at, ultimo_login: u.last_sign_in_at ?? null,
    confirmado: Boolean(u.email_confirmed_at), bloqueado: Boolean((u as { banned_until?: string | null }).banned_until && new Date((u as { banned_until?: string }).banned_until!) > new Date()),
    padroes: nomesPadrao.get(u.id) ?? [], favoritos: nFav.get(u.id) ?? 0, pipeline: nPipe.get(u.id) ?? 0, lotes: nLotes.get(u.id) ?? 0 }; })
    .sort((a, b) => (a.papel === b.papel ? b.criado_em.localeCompare(a.criado_em) : a.papel === "admin" ? -1 : 1));
  return NextResponse.json({ usuarios: lista, outrosNoProjeto: usuarios.data.users.length - lista.length });
}

/** Cria conta já confirmada (o admin entrega e-mail e senha para a pessoa). */
export async function POST(req: Request) {
  const g = await exigirAdmin(); if ("erro" in g) return NextResponse.json({ erro: g.erro }, { status: g.status });
  const { admin } = g;
  const { email, senha, nome, papel } = (await req.json()) as { email?: string; senha?: string; nome?: string; papel?: "admin" | "cliente" };
  if (!email || !senha || senha.length < 6) return NextResponse.json({ erro: "E-mail e senha (mínimo 6 caracteres) são obrigatórios." }, { status: 400 });
  const { data, error } = await admin.auth.admin.createUser({ email: email.trim().toLowerCase(), password: senha, email_confirm: true, user_metadata: { nome: nome?.trim() ?? "" } });
  if (error || !data.user) return NextResponse.json({ erro: error?.message ?? "Não criou." }, { status: 400 });
  const { error: e2 } = await admin.from("lotwise_perfis").upsert({ user_id: data.user.id, nome: nome?.trim() ?? "", papel: papel === "admin" ? "admin" : "cliente" });
  if (e2) return NextResponse.json({ erro: e2.message }, { status: 500 });
  // Mesmo ponto de partida de quem se cadastra sozinho: "Padrão Lotwise" ativo, editável pelo cliente.
  const p = PADRAO_LOTWISE(); await admin.from("lotwise_padroes").upsert({ user_id: data.user.id, id: p.id, dados: p, ativo: true });
  return NextResponse.json({ id: data.user.id });
}
