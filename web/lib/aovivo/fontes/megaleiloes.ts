// Mega Leilões: HTML do lote. Status em .instance-text, praças em .instance
// (a vigente tem a classe "active"), avaliação e "Último Lance" nos pares
// .item > .header/.value, igual ao collectors/megaleiloes.py.
import type { EstadoAoVivo } from "../tipos";
import { blocos, classesDe, dinheiro, fotosUnicas, paraISO, situacaoPorTexto, texto, textoPlano } from "../comum";

/** Valor do par .header/.value cujo cabeçalho contém o rótulo. */
function parRotulado(html: string, rotulo: RegExp): string | undefined {
  const re = /<div class="header">([\s\S]{0,80}?)<\/div>\s*<div class="value">([\s\S]{0,200}?)<\/div>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (rotulo.test(texto(m[1]!))) return texto(m[2]!);
  }
  return undefined;
}

export async function extrair(html: string): Promise<Partial<EstadoAoVivo>> {
  const plano = textoPlano(html);
  const fora: Partial<EstadoAoVivo> = {};

  const aval = parRotulado(html, /Avalia/i);
  if (aval) fora.avaliacao = dinheiro(aval.split("(")[0]);
  const ultimo = parRotulado(html, /[ÚU]ltimo Lance/i);
  const ultimoValor = ultimo ? dinheiro(ultimo) : undefined;

  // praças: .instance (first/passed/active) com data em <b>Nª Praça:</b> e valor em .card-instance-value
  const corpos = blocos(html, "instance");
  const classes = classesDe(html, "instance");
  const pracas = corpos.map((c, k) => {
    const t = texto(c);
    const rot = /(\d)\s*[ªa°º]\s*Pra[çc]a/i.exec(t);
    const valores = blocos(c, "card-instance-value");
    return {
      ativa: (classes[k] ?? []).includes("active"),
      n: rot ? Number(rot[1]) : undefined,
      data: paraISO(t),
      valor: dinheiro(texto(valores[0] ?? "")),
    };
  });
  const ativa = pracas.find((p) => p.ativa && p.valor) ?? pracas.find((p) => p.ativa);
  const vigente = ativa ?? pracas[pracas.length - 1];
  if (vigente) {
    if (vigente.valor) fora.lance_minimo = vigente.valor;
    if (vigente.data) fora.data_leilao = vigente.data;
    if (vigente.n) fora.praca = vigente.n;
  }
  const datas = pracas.map((p) => p.data).filter((d): d is string => !!d);
  if (datas.length) fora.data_fim = datas.sort()[datas.length - 1];
  // "Último Lance" repete o mínimo quando ninguém lançou: só vale se estiver acima
  if (ultimoValor !== undefined && fora.lance_minimo !== undefined && ultimoValor > fora.lance_minimo) {
    fora.lance_atual = ultimoValor;
  }
  // sem "Avaliação" na página, o coletor usa o valor da 1ª praça (é o que o site publica)
  if (fora.avaliacao === undefined && pracas.length > 1) {
    const primeira = pracas[0]?.valor;
    if (primeira !== undefined && fora.lance_minimo !== undefined && primeira > fora.lance_minimo) {
      fora.avaliacao = primeira;
    }
  }

  fora.fotos = fotosUnicas(
    [...html.matchAll(/(?:src|data-src)\s*=\s*["']([^"']*\/batches\/[^"']+)["']/gi)].map((m) => m[1]),
  );

  const st = texto(blocos(html, "instance-text")[0] ?? "");
  fora.situacao =
    situacaoPorTexto(st) ??
    situacaoPorTexto(plano.slice(0, 2500)) ??
    (fora.lance_minimo !== undefined ? "aberto" : "desconhecido");
  return fora;
}
