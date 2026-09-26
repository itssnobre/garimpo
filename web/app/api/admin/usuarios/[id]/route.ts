import { NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/supabase/admin";
import { tServer } from "@/lib/i18n/server";
import { origemOk } from "@/lib/origem";
import type { SupabaseClient } from "@supabase/supabase-js";
export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

// O projeto Supabase é compartilhado com outros apps: o painel só mexe em quem tem perfil da Lotwise.
async function ehDaLotwise(admin: SupabaseClient, id: string): Promise<boolean> {
  const { data, error } = await admin.from("lotwise_perfis").select("user_id").eq("user_id", id).maybeSingle();
  return !error && Boolean(data);
}

/** Detalhe: padrões completos do usuário (para o admin conferir as regras dele). */
export async function GET(_: Request, { params }: Ctx) {
  const t = await tServer();
  const g = await exigirAdmin(); if ("erro" in g) return NextResponse.json({ erro: t(g.erro) }, { status: g.status });
  const { id } = await params;
  if (!(await ehDaLotwise(g.admin, id))) return NextResponse.json({ erro: t("Conta não encontrada.") }, { status: 404 });
  const [{ data: padroes }, { data: pipeline }] = await Promise.all([
    g.admin.from("lotwise_padroes").select("id,dados,ativo,atualizado_em").eq("user_id", id),
    g.admin.from("lotwise_pipeline").select("lote_id,dados").eq("user_id", id),
  ]);
  return NextResponse.json({ padroes: padroes ?? [], pipeline: pipeline ?? [] });
}

/** Edita: nome, e-mail, senha nova, papel, bloqueio. Um admin não rebaixa nem bloqueia a si mesmo. */
export async function PATCH(req: Request, { params }: Ctx) {
  const t = await tServer();
  if (!origemOk(req)) return NextResponse.json({ erro: t("Origem não permitida.") }, { status: 403 });
  const g = await exigirAdmin(); if ("erro" in g) return NextResponse.json({ erro: t(g.erro) }, { status: g.status });
  const { admin, quem } = g; const { id } = await params;
  if (!(await ehDaLotwise(admin, id))) return NextResponse.json({ erro: t("Conta não encontrada.") }, { status: 404 });
  const b = (await req.json()) as { nome?: string; email?: string; senha?: string; papel?: "admin" | "cliente"; bloqueado?: boolean };
  if (b.papel !== undefined && b.papel !== "admin" && b.papel !== "cliente") return NextResponse.json({ erro: t("Papel inválido.") }, { status: 400 });
  if (id === quem.id && (b.papel === "cliente" || b.bloqueado === true)) return NextResponse.json({ erro: t("Você não pode rebaixar nem bloquear a própria conta.") }, { status: 400 });
  const attrs: Record<string, unknown> = {};
  if (b.email) attrs.email = b.email.trim().toLowerCase();
  if (b.senha) { if (b.senha.length < 6) return NextResponse.json({ erro: t("Senha com pelo menos 6 caracteres.") }, { status: 400 }); attrs.password = b.senha; }
  if (b.nome !== undefined) attrs.user_metadata = { nome: b.nome.trim() };
  if (b.bloqueado !== undefined) attrs.ban_duration = b.bloqueado ? "87600h" : "none";
  if (attrs.email) attrs.email_confirm = true;
  if (Object.keys(attrs).length) { const { error } = await admin.auth.admin.updateUserById(id, attrs); if (error) return NextResponse.json({ erro: error.message }, { status: 400 }); }
  const perfil: Record<string, unknown> = {}; if (b.nome !== undefined) perfil.nome = b.nome.trim(); if (b.papel) perfil.papel = b.papel;
  if (Object.keys(perfil).length) { const { error } = await admin.from("lotwise_perfis").upsert({ user_id: id, ...perfil }); if (error) return NextResponse.json({ erro: error.message }, { status: 500 }); }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const t = await tServer();
  if (!origemOk(req)) return NextResponse.json({ erro: t("Origem não permitida.") }, { status: 403 });
  const g = await exigirAdmin(); if ("erro" in g) return NextResponse.json({ erro: t(g.erro) }, { status: g.status });
  const { id } = await params;
  if (id === g.quem.id) return NextResponse.json({ erro: t("Você não pode apagar a própria conta por aqui. Use Configurações.") }, { status: 400 });
  if (!(await ehDaLotwise(g.admin, id))) return NextResponse.json({ erro: t("Conta não encontrada.") }, { status: 404 });
  const { error } = await g.admin.auth.admin.deleteUser(id);
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
