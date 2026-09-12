import { NextResponse } from "next/server";
import { buscar, poolParaMotor, type FiltrosBusca, type Ordem } from "@/lib/catalogo";
import { avaliarPadrao, type Regras } from "@/lib/motor";
import { supabaseServer } from "@/lib/supabase/server";
import { origemOk } from "@/lib/origem";
import { tServer } from "@/lib/i18n/server";
export const dynamic = "force-dynamic";

// Sem conta, a busca mostra uma amostra. O corte é aqui no servidor, não na tela.
const AMOSTRA_VISITANTE = 30;
const CORPO_MAX = 16 * 1024;
// Quando a ordem depende da conta de margem, o banco entrega este tanto e o motor pontua.
// Acima disso o ranking passa a ser dos melhores por deságio, e a resposta avisa com `cortado`.
const TETO_MOTOR = 1500;

// Score e margem saem do motor, que precisa dos custos do usuário; o resto o banco ordena.
const PRECISA_MOTOR = (o: Ordem, soPassam: boolean, temPadrao: boolean) =>
  temPadrao && (soPassam || o === "score" || o === "margem");

export async function POST(req: Request) {
  const t = await tServer();
  if (!origemOk(req)) return NextResponse.json({ erro: t("Origem não permitida.") }, { status: 403 });
  const bruto = await req.text();
  if (bruto.length > CORPO_MAX) return NextResponse.json({ erro: t("Filtros longos demais.") }, { status: 413 });
  let corpo: unknown;
  try { corpo = JSON.parse(bruto || "{}"); } catch { return NextResponse.json({ erro: t("Corpo inválido: esperado JSON.") }, { status: 400 }); }

  const { filtros = {}, padrao = null, soPassam = false, ordem = "desagio", inicio = 0, quantos = 48, previa = false } =
    (corpo ?? {}) as { filtros?: FiltrosBusca; padrao?: Regras | null; soPassam?: boolean; ordem?: Ordem; inicio?: number; quantos?: number; previa?: boolean };

  const sb = await supabaseServer();
  const usuario = sb ? (await sb.auth.getUser()).data.user : null;
  const limite = usuario ? Math.min(200, Math.max(1, quantos)) : AMOSTRA_VISITANTE;
  const de = usuario ? Math.max(0, inicio) : 0;

  const base: FiltrosBusca = { ...filtros, padrao: padrao ?? filtros.padrao ?? null };

  // Prévia do editor de padrão: quantos passam, quantos batem a margem alvo e o melhor score.
  if (previa && padrao) {
    const [pool, semPadrao] = await Promise.all([
      poolParaMotor(base, TETO_MOTOR),
      buscar({ ...filtros, padrao: null, ordem: "desagio", inicio: 0, quantos: 1 }),
    ]);
    const passam = pool.itens.map((i) => avaliarPadrao(i, padrao)).filter((a) => a.passa);
    return NextResponse.json({
      passam: passam.length,
      alvo: passam.filter((a) => a.res.margem >= padrao.margemAlvo).length,
      melhor: passam.reduce((m, a) => Math.max(m, a.score), 0),
      base: semPadrao.total,
      cortado: pool.cortado,
    });
  }

  if (!PRECISA_MOTOR(ordem, soPassam, Boolean(padrao))) {
    const { itens, total } = await buscar({ ...base, ordem, inicio: de, quantos: limite });
    return NextResponse.json({ itens, total, mostrando: itens.length, cortado: false, amostra: !usuario });
  }

  // Com padrão ativo o motor decide quem passa e em que ordem, então a página sai daqui.
  const { itens, total, cortado } = await poolParaMotor(base, TETO_MOTOR);
  const regras = padrao as Regras;
  const avaliados = itens.map((i) => ({ i, a: avaliarPadrao(i, regras) }));
  const passam = soPassam ? avaliados.filter((x) => x.a.passa) : avaliados;
  const chave = ordem === "margem" ? (x: (typeof passam)[number]) => -x.a.res.margem : (x: (typeof passam)[number]) => -x.a.score;
  passam.sort((x, y) => chave(x) - chave(y));
  const pagina = passam.slice(de, de + limite);
  return NextResponse.json({
    itens: pagina.map((x) => x.i),
    total: passam.length,
    mostrando: pagina.length,
    // `cortado` avisa a tela de que o ranking olhou os melhores por deságio, não a base inteira.
    cortado: cortado && !soPassam,
    amostra: !usuario,
  });
}
