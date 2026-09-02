// Extrator genérico: usado nas fontes sem parser dedicado (emgea white-label à parte,
// leilaovip, freitasleiloeiro, nakakogue, sodresantoro, wspleiloes, gestorleiloes).
// Trabalha só com o texto da página: palavras de status, o primeiro "R$ x" perto de
// rótulos de lance e as datas próximas de "praça"/"leilão"/"encerramento".
import type { EstadoAoVivo } from "../tipos";
import { dataApos, dinheiroApos, situacaoPorTexto, textoPlano } from "../comum";

const ROTULOS_MINIMO = [
  /lance\s+m[íi]nimo/i,
  /valor\s+m[íi]nimo/i,
  /lance\s+inicial/i,
  /valor\s+inicial/i,
  /lance\s+de\s+abertura/i,
  /valor\s+de\s+venda/i,
  /1[ºªao°]?\s*(?:pra[çc]a|leil[ãa]o)/i,
];
const ROTULOS_ATUAL = [/lance\s+atual/i, /valor\s+atual/i, /maior\s+lance/i, /[úu]ltimo\s+lance/i];
const ROTULOS_AVALIACAO = [/(?:valor\s+(?:de\s+)?)?avalia[çc][ãa]o/i, /avaliad[oa]\s+em/i, /valor\s+avaliado/i];
const ROTULOS_DATA = [
  /encerramento(?:\s+do\s+leil[ãa]o)?/i,
  /data\s+d[oa]\s+(?:leil[ãa]o|pra[çc]a|licita[çc][ãa]o)/i,
  /\d\s*[ªa]\s*pra[çc]a/i,
  /\d\s*[ºo°]\s*leil[ãa]o/i,
  /leil[ãa]o\s*:/i,
  /termina\s+em/i,
];

/** Status: procura no começo da página (onde ficam os selos) e depois no corpo todo. */
function situacao(t: string): EstadoAoVivo["situacao"] {
  const cabeca = t.slice(0, 4000);
  const encerrado =
    /leil[ãa]o\s+encerrado|lote\s+encerrado|lote\s+vendido|lote\s+arrematad|leil[ãa]o\s+j[áa]\s+foi\s+encerrado|lote\s+suspenso|lote\s+retirado|lote\s+cancelado/i;
  const m = encerrado.exec(t);
  if (m) return situacaoPorTexto(m[0]) ?? "encerrado";
  return situacaoPorTexto(cabeca) ?? "desconhecido";
}

function primeiro(t: string, rotulos: RegExp[], janela = 90): number | undefined {
  for (const r of rotulos) {
    const v = dinheiroApos(t, r, janela);
    if (v !== undefined) return v;
  }
  return undefined;
}

export async function extrair(html: string): Promise<Partial<EstadoAoVivo>> {
  const t = textoPlano(html);
  const fora: Partial<EstadoAoVivo> = { situacao: situacao(t) };

  const minimo = primeiro(t, ROTULOS_MINIMO);
  if (minimo !== undefined) fora.lance_minimo = minimo;
  const atual = primeiro(t, ROTULOS_ATUAL);
  if (atual !== undefined && atual > 0) fora.lance_atual = atual;
  const aval = primeiro(t, ROTULOS_AVALIACAO, 110);
  if (aval !== undefined) fora.avaliacao = aval;

  const datas: string[] = [];
  for (const r of ROTULOS_DATA) {
    const d = dataApos(t, r, 80);
    if (d && !datas.includes(d)) datas.push(d);
  }
  datas.sort();
  const hoje = new Date().toISOString().slice(0, 10);
  const futura = datas.find((d) => d >= hoje);
  if (futura ?? datas[0]) fora.data_leilao = futura ?? datas[0];
  if (datas.length) fora.data_fim = datas[datas.length - 1];

  const praca = /(\d)\s*[ªa]\s*pra[çc]a|(\d)\s*[ºo°]\s*leil[ãa]o/i.exec(t);
  const n = Number(praca?.[1] ?? praca?.[2] ?? NaN);
  if (Number.isFinite(n) && n >= 1 && n <= 3) fora.praca = n;

  // sem valor e sem status reconhecido a situação fica "desconhecido" de propósito:
  // é melhor avisar que não deu para ler do que chutar que o leilão acabou.
  return fora;
}
