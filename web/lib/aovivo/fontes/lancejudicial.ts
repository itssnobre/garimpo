// Lance Judicial / Grupo Lance: página HTML do lote em grupolance.com.br.
// Os blocos .product-detail trazem "Valor de avaliação", "Valor atual"/"Valor inicial",
// "Inicia em" e "Encerramento do leilão".
import type { EstadoAoVivo } from "../tipos";
import { blocos, dinheiro, dinheiroApos, dataApos, fotosUnicas, situacaoPorTexto, texto } from "../comum";

export async function extrair(html: string): Promise<Partial<EstadoAoVivo>> {
  const plano = texto(html).replace(/\n/g, " | ");
  const fora: Partial<EstadoAoVivo> = {};

  // pares rótulo/valor da coluna de valores
  for (const b of blocos(html, "product-detail")) {
    const t = texto(b).replace(/\n/g, " ").trim();
    if (/^Valor de avalia/i.test(t)) fora.avaliacao = dinheiro(t.split("R$")[1]);
    else if (/^Valor atual/i.test(t)) fora.lance_atual = dinheiro(t.split("R$")[1]);
    else if (/^(Valor inicial|Lance inicial)/i.test(t)) fora.lance_minimo = dinheiro(t.split("R$")[1]);
  }
  fora.avaliacao = fora.avaliacao ?? dinheiroApos(plano, /Valor de Avalia[çc][ãa]o\s*:?/i, 60);
  fora.lance_minimo =
    fora.lance_minimo ??
    dinheiroApos(plano, /Valor Inicial(?: da Venda Direta)?\s*:?/i, 60) ??
    dinheiroApos(plano, /Lance inicial\s*:?/i, 60);
  if (fora.lance_atual === undefined) {
    const atual = dinheiroApos(plano, /Valor atual\s*:?/i, 50);
    if (atual !== undefined && (fora.lance_minimo === undefined || atual > fora.lance_minimo)) fora.lance_atual = atual;
  }
  // "Valor atual" quando ninguém deu lance é o próprio valor inicial: não é lance real
  if (fora.lance_atual !== undefined && fora.lance_minimo !== undefined && fora.lance_atual <= fora.lance_minimo) {
    delete fora.lance_atual;
  }

  const inicio = dataApos(plano, /Inicia em/i, 40);
  const fim = dataApos(plano, /Encerramento do leil[ãa]o/i, 40);
  if (inicio ?? fim) {
    fora.data_leilao = inicio ?? fim;
    fora.data_fim = fim ?? inicio;
  }
  const praca = /(\d)\s*[ªa]\s*pra[çc]a/i.exec(plano);
  if (praca) fora.praca = Number(praca[1]);

  fora.fotos = fotosUnicas(
    [...html.matchAll(/class="[^"]*rsImg[^"]*"[^>]*\bhref\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]),
  );

  const status = texto(blocos(html, "product-card-type")[0] ?? "");
  fora.situacao =
    situacaoPorTexto(status) ??
    situacaoPorTexto(plano.slice(0, 2500)) ??
    (fora.lance_minimo !== undefined ? "aberto" : "desconhecido");
  return fora;
}
