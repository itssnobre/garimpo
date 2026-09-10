// Dá papel admin ao usuário com o e-mail informado (cria o perfil se ainda não existir). Usa a chave de serviço do .env.local.
// Uso: node scripts/promover-admin.mjs email@dominio
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n").filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const email = (process.argv[2] || "").toLowerCase();
if (!email) { console.error("informe o e-mail"); process.exit(1); }

let users = [], page = 1;
for (;;) { const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 }); if (error) throw error; users.push(...data.users); if (data.users.length < 1000) break; page++; }
const alvo = users.filter((u) => (u.email || "").toLowerCase() === email);
if (!alvo.length) { console.log(`nenhum usuário com ${email} (faça o login primeiro)`); process.exit(2); }
for (const u of alvo) {
  const nome = u.user_metadata?.nome ?? u.user_metadata?.full_name ?? u.user_metadata?.name ?? "";
  const { data: atual } = await sb.from("lotwise_perfis").select("nome,papel").eq("user_id", u.id).maybeSingle();
  const { error } = await sb.from("lotwise_perfis").upsert({ user_id: u.id, nome: atual?.nome || nome, papel: "admin" });
  if (error) throw error;
  console.log(`${email} (${u.id}, provedores: ${(u.identities || []).map((i) => i.provider).join(",")}): papel ${atual?.papel ?? "sem perfil"} -> admin`);
}
