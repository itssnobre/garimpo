import { NextResponse } from "next/server";
import { quemChama, supabaseAdmin } from "@/lib/supabase/admin";
export const runtime = "nodejs";

/** O próprio usuário apaga a conta. As tabelas lotwise_* caem em cascata pelo user_id. */
export async function DELETE() {
  const q = await quemChama(); if (!q) return NextResponse.json({ erro: "Entre na sua conta." }, { status: 401 });
  const admin = supabaseAdmin(); if (!admin) return NextResponse.json({ erro: "Exclusão indisponível neste servidor." }, { status: 500 });
  const { error } = await admin.auth.admin.deleteUser(q.id);
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
