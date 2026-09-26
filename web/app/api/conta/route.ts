import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { quemChama, supabaseAdmin } from "@/lib/supabase/admin";
import { tServer } from "@/lib/i18n/server";
import { origemOk } from "@/lib/origem";
import { permitir } from "@/lib/limite";
export const runtime = "nodejs";

const TENTATIVAS_POR_HORA = 5;

/** O próprio usuário apaga a conta. As tabelas lotwise_* caem em cascata pelo user_id.
 *  Exige a senha atual no corpo: quem só pegou o aparelho com a sessão aberta não apaga a conta
 *  (que é do projeto Supabase inteiro, não só da Lotwise). */
export async function DELETE(req: Request) {
  const t = await tServer();
  if (!origemOk(req)) return NextResponse.json({ erro: t("Origem não permitida.") }, { status: 403 });
  const q = await quemChama(); if (!q) return NextResponse.json({ erro: t("Entre na sua conta.") }, { status: 401 });
  const admin = supabaseAdmin(); if (!admin) return NextResponse.json({ erro: t("Exclusão indisponível neste servidor.") }, { status: 500 });

  const corpo = (await req.json().catch(() => null)) as { senha?: unknown } | null;
  const senha = typeof corpo?.senha === "string" ? corpo.senha : "";
  if (!senha || senha.length > 200 || !q.email) return NextResponse.json({ erro: t("Confirme com a sua senha atual.") }, { status: 400 });
  if (!(await permitir(`conta-excluir:${q.id}`, TENTATIVAS_POR_HORA, 60 * 60)).ok)
    return NextResponse.json({ erro: t("Muitas tentativas. Tente daqui a pouco.") }, { status: 429 });

  // Cliente avulso, sem cookies nem sessão persistida: só confere a senha, não mexe na sessão do navegador.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, chave = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !chave) return NextResponse.json({ erro: t("Exclusão indisponível neste servidor.") }, { status: 500 });
  const avulso = createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { data: ok, error: eSenha } = await avulso.auth.signInWithPassword({ email: q.email, password: senha });
  if (eSenha || ok.user?.id !== q.id) return NextResponse.json({ erro: t("A senha atual não confere.") }, { status: 403 });
  await avulso.auth.signOut({ scope: "local" }).catch(() => {});

  const { error } = await admin.auth.admin.deleteUser(q.id);
  if (error) return NextResponse.json({ erro: t("Não consegui excluir agora.") }, { status: 400 });
  return NextResponse.json({ ok: true });
}
