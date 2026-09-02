import { NextResponse } from "next/server";
import { exigirAdmin } from "@/lib/supabase/admin";
export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

/** Detalhe: padrões completos do usuário (para o admin conferir as regras dele). */
export async function GET(_: Request, { params }: Ctx) {
  const g = await exigirAdmin(); if ("erro" in g) return NextResponse.json({ erro: g.erro }, { status: g.status });
  const { id } = await params;
  const [{ data: padroes }, { data: pipeline }] = await Promise.all([
    g.admin.from("lotwise_padroes").select("id,dados,ativo,atualizado_em").eq("user_id", id),
    g.admin.from("lotwise_pipeline").select("lote_id,dados").eq("user_id", id),
  ]);
  return NextResponse.json({ padroes: padroes ?? [], pipeline: pipeline ?? [] });
}

/** Edita: nome, e-mail, senha nova, papel, bloqueio. Um admin não rebaixa nem bloqueia a si mesmo. */
export async function PATCH(req: Request, { params }: Ctx) {
  const g = await exigirAdmin(); if ("erro" in g) return NextResponse.json({ erro: g.erro }, { status: g.status });
  const { admin, quem } = g; const { id } = await params;
  const b = (await req.json()) as { nome?: string; email?: string; senha?: string; papel?: "admin" | "cliente"; bloqueado?: boolean };
  if (id === quem.id && (b.papel === "cliente" || b.bloqueado === true)) return NextResponse.json({ erro: "Você não pode rebaixar nem bloquear a própria conta." }, { status: 400 });
  const attrs: Record<string, unknown> = {};
  if (b.email) attrs.email = b.email.trim().toLowerCase();
  if (b.senha) { if (b.senha.length < 6) return NextResponse.json({ erro: "Senha com pelo menos 6 caracteres." }, { status: 400 }); attrs.password = b.senha; }
  if (b.nome !== undefined) attrs.user_metadata = { nome: b.nome.trim() };
  if (b.bloqueado !== undefined) attrs.ban_duration = b.bloqueado ? "87600h" : "none";
  if (attrs.email) attrs.email_confirm = true;
  if (Object.keys(attrs).length) { const { error } = await admin.auth.admin.updateUserById(id, attrs); if (error) return NextResponse.json({ erro: error.message }, { status: 400 }); }
  const perfil: Record<string, unknown> = {}; if (b.nome !== undefined) perfil.nome = b.nome.trim(); if (b.papel) perfil.papel = b.papel;
  if (Object.keys(perfil).length) { const { error } = await admin.from("lotwise_perfis").upsert({ user_id: id, ...perfil }); if (error) return NextResponse.json({ erro: error.message }, { status: 500 }); }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, { params }: Ctx) {
  const g = await exigirAdmin(); if ("erro" in g) return NextResponse.json({ erro: g.erro }, { status: g.status });
  const { id } = await params;
  if (id === g.quem.id) return NextResponse.json({ erro: "Você não pode apagar a própria conta por aqui. Use Configurações." }, { status: 400 });
  const { error } = await g.admin.auth.admin.deleteUser(id);
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
