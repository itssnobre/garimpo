// Cria as contas iniciais da Lotwise (admin + Lucinei com o padrão dele) usando a chave de serviço.
// Uso: node scripts/contas-iniciais.mjs (dentro de web/; lê .env.local). Idempotente: conta que já existe é só atualizada.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n").filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const senha = () => { const a = "abcdefghjkmnpqrstuvwxyz", A = "ABCDEFGHJKMNPQRSTUVWXYZ", n = "23456789"; const pick = (s) => s[randomBytes(1)[0] % s.length]; return pick(A) + Array.from({ length: 5 }, () => pick(a)).join("") + Array.from({ length: 4 }, () => pick(n)).join(""); };
const CUSTOS = { leiloeiro: 5, itbi: 2.5, registro: 1.2, advogado: 2500, certidoes: 500, debitos: 0, desocupacao: 0, reforma: 0, meses: 6, mensal: 500, corretagem: 6, ir: 15, descontoVenda: 5 };
const REGIAO = ["Sorocaba", "Votorantim", "Itu", "Salto", "Araçoiaba da Serra", "Piedade", "Itapetininga", "Tatuí", "Boituva", "Porto Feliz", "Mairinque", "São Roque", "Alumínio", "Iperó", "Capela do Alto", "Tietê", "Ibiúna", "Pilar do Sul", "Salto de Pirapora",
  "São Bernardo do Campo", "Santo André", "São Caetano do Sul", "Diadema", "Mauá", "Ribeirão Pires", "Rio Grande da Serra"];
// Brief do Lucinei (06/08 e 25/08): avaliação 200 a 250 mil, deságio 40%+, margem líquida mínima 25% (alvo 30 a 35%), Sorocaba/ABC e cidades próximas, sem teto de lance, vetos de diligência.
const PADRAO_LUCINEI = { id: "p-lucinei", nome: "Padrão do Lucinei", faixaMin: 200000, faixaMax: 250000, lanceMax: 0, desagioMin: 0.4, margemMin: 0.25, margemAlvo: 0.3,
  ufs: ["SP"], cidades: REGIAO, tipos: [], modalidades: [], ocupacao: "qualquer", exigeFinanciamento: false, vetoFiduciante: true, vetoFracao: true, vetoEdital: false, quartosMin: 0, areaMin: 0, areaMax: 0, custos: CUSTOS, criadoEm: new Date().toISOString() };

async function garantir({ email, nome, papel, padrao }) {
  const pass = senha();
  const { data: lista } = await sb.auth.admin.listUsers({ perPage: 1000 });
  let u = lista.users.find((x) => x.email === email);
  if (u) { await sb.auth.admin.updateUserById(u.id, { password: pass, email_confirm: true, user_metadata: { nome } }); }
  else { const { data, error } = await sb.auth.admin.createUser({ email, password: pass, email_confirm: true, user_metadata: { nome } }); if (error) throw error; u = data.user; }
  const { error: e2 } = await sb.from("lotwise_perfis").upsert({ user_id: u.id, nome, papel }); if (e2) throw e2;
  if (padrao) { const { error: e3 } = await sb.from("lotwise_padroes").upsert({ user_id: u.id, id: padrao.id, dados: padrao, ativo: true }); if (e3) throw e3; }
  console.log(`${papel.padEnd(8)} ${email.padEnd(28)} senha: ${pass}${padrao ? `   padrão "${padrao.nome}" ativo` : ""}`);
}

await garantir({ email: process.env.ADMIN_EMAIL ?? "itssnobre@gmail.com", nome: "Nobre", papel: "admin" });
await garantir({ email: process.env.LUCINEI_EMAIL ?? "lucinei@lotwise.com.br", nome: "Lucinei", papel: "cliente", padrao: PADRAO_LUCINEI });
console.log("\nSenhas geradas agora e mostradas só aqui. Troque em Configurações ou no painel Administração.");
