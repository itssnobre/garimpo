/**
 * Teste de campo da camada ao vivo: pega 2 lotes reais (com data de leilão futura
 * quando existe) de cada fonte e roda verificarLote, imprimindo uma tabela.
 *
 *   cd web && npx tsx scripts/aovivo-teste.mts            # 8 maiores fontes
 *   cd web && npx tsx scripts/aovivo-teste.mts --todas    # todas as fontes
 *   cd web && npx tsx scripts/aovivo-teste.mts caixa zuk  # fontes escolhidas
 */
import imoveis from "../data/imoveis.json" with { type: "json" };
import type { Imovel } from "../lib/types";
import { verificarLote, temExtratorDedicado, type EstadoAoVivo } from "../lib/aovivo/index";

const MAIORES = [
  "caixa",
  "leilaoimovel",
  "resale",
  "leiloesjudiciais",
  "superbid",
  "megaleiloes",
  "santanderimoveis",
  "pestanaleiloes",
];

const args = process.argv.slice(2);
const todos = imoveis as unknown as Imovel[];
const porFonte = new Map<string, Imovel[]>();
for (const i of todos) {
  const l = porFonte.get(i.fonte) ?? [];
  l.push(i);
  porFonte.set(i.fonte, l);
}

const fontes = args.includes("--todas")
  ? [...porFonte.keys()].sort((a, b) => (porFonte.get(b)?.length ?? 0) - (porFonte.get(a)?.length ?? 0))
  : args.filter((a) => !a.startsWith("--")).length
    ? args.filter((a) => !a.startsWith("--"))
    : MAIORES;

const hoje = new Date().toISOString().slice(0, 10);
const alvos: Imovel[] = [];
for (const f of fontes) {
  const l = porFonte.get(f) ?? [];
  const futuros = l.filter((x) => (x.data_leilao ?? "") >= hoje);
  alvos.push(...(futuros.length ? futuros : l).slice(0, 2));
}

function brl(v?: number): string {
  if (v === undefined) return "-";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function corta(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function linha(cols: string[], larguras: number[]): string {
  return cols.map((c, k) => corta(c, larguras[k]!).padEnd(larguras[k]!)).join("  ");
}

const LARG = [17, 26, 13, 13, 13, 10, 44, 46];
const CAB = ["fonte", "id", "situacao", "lance", "avaliacao", "data", "mudancas", "erro"];

console.log(`${alvos.length} lotes, ${fontes.length} fontes, ${hoje}\n`);
console.log(linha(CAB, LARG));
console.log(LARG.map((n) => "-".repeat(n)).join("  "));

const resultados: { i: Imovel; e: EstadoAoVivo }[] = [];
for (const i of alvos) {
  const e = await verificarLote(i);
  resultados.push({ i, e });
  const lance = e.lance_atual !== undefined ? `${brl(e.lance_minimo)}>${brl(e.lance_atual)}` : brl(e.lance_minimo);
  console.log(
    linha(
      [
        i.fonte + (temExtratorDedicado(i.fonte) ? "" : " (gen)"),
        i.id,
        e.ok ? e.situacao : "ERRO",
        lance,
        brl(e.avaliacao),
        e.data_leilao ?? "-",
        e.mudancas.join(" ; ") || "-",
        e.erro ?? "",
      ],
      LARG,
    ),
  );
}

const ok = resultados.filter((r) => r.e.ok).length;
const comValor = resultados.filter((r) => r.e.lance_minimo !== undefined).length;
console.log(
  `\n${ok}/${resultados.length} responderam ok; ${comValor} com lance lido; ` +
    `${resultados.filter((r) => r.e.mudancas.length).length} com alguma mudança.`,
);
const falhas = resultados.filter((r) => !r.e.ok);
if (falhas.length) {
  console.log("\nFalhas:");
  for (const f of falhas) console.log(`  ${f.i.fonte} ${f.i.id}: ${f.e.erro}`);
}
