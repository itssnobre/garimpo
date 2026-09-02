// Bomvalor (mercado.bomvalor.com.br): HTML do lote, com redirect para a url do leiloeiro
// parceiro. O valor de referência fica em .bv-vl-lance e o encerramento no bloco da praça.
// O site não publica avaliação (o coletor só a tem quando a descrição traz "Avaliação: R$ X").
import type { EstadoAoVivo } from "../tipos";
import { blocos, dinheiro, dinheiroApos, dataApos, fotosUnicas, situacaoPorTexto, texto } from "../comum";

export async function extrair(html: string): Promise<Partial<EstadoAoVivo>> {
  const plano = texto(html).replace(/\n/g, " | ");
  const fora: Partial<EstadoAoVivo> = {};

  const lance = blocos(html, "bv-vl-lance")[0];
  fora.lance_minimo =
    (lance ? dinheiro(texto(lance).split("R$").pop()) : undefined) ??
    dinheiroApos(plano, /Valor de refer[êe]ncia\s*:?/i, 50) ??
    dinheiroApos(plano, /Lance (?:atual|inicial|m[íi]nimo)\s*:?/i, 50);
  fora.avaliacao = dinheiroApos(plano, /avalia[çc][ãa]o\s*:?/i, 50);

  const enc = dataApos(plano, /Encerramento/i, 60);
  const ab = dataApos(plano, /Data de Abertura/i, 60);
  if (enc ?? ab) {
    fora.data_leilao = enc ?? ab;
    fora.data_fim = enc ?? ab;
  }
  const praca = /(\d)\s*[ªa°º]\s*pra[çc]a/i.exec(plano);
  if (praca) fora.praca = Number(praca[1]);
  else if (/pra[çc]a [úu]nica/i.test(plano)) fora.praca = 1;

  fora.fotos = fotosUnicas(
    [...html.matchAll(/(?:src|background-image:\s*url\(['"]?)([^"'()\s]*\/fotos\/[^"'()\s]+)/gi)]
      .map((m) => m[1])
      .filter((u) => u && !/nao-disponivel/i.test(u)),
  );

  fora.situacao =
    situacaoPorTexto(plano.slice(0, 3000)) ?? (fora.lance_minimo !== undefined ? "aberto" : "desconhecido");
  return fora;
}
