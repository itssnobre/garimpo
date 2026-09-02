// Fidalgo Leilões: lote.php?idLote=<id> (site PHP, ISO-8859-1).
// Rótulos em linhas: "Avaliação", "Valor de venda", "Lance inicial", "LANCE ATUAL", "Data".
import type { Imovel } from "../../types";
import type { EstadoAoVivo, Requisicao } from "../tipos";
import { absoluta, dinheiro, dinheiroApos, fotosUnicas, paraISO, situacaoPorTexto, texto } from "../comum";

const BASE = "https://www.fidalgoleiloes.com.br";

export function pedido(i: Imovel): Requisicao {
  const id = (i.id.split(":")[1] ?? "").replace(/\D/g, "");
  return { url: `${BASE}/lote.php?idLote=${id}` };
}

/** Valor do rótulo: resto da linha, ou a linha seguinte (o site quebra label/valor). */
function apos(linhas: string[], rotulo: string): string | undefined {
  const alvo = rotulo.toLowerCase();
  for (let k = 0; k < linhas.length; k++) {
    const l = linhas[k]!;
    if (!l.toLowerCase().startsWith(alvo)) continue;
    const resto = l.slice(rotulo.length).replace(/^[\s:]+/, "");
    return resto || linhas[k + 1];
  }
  return undefined;
}

export async function extrair(html: string): Promise<Partial<EstadoAoVivo>> {
  const linhas = texto(html)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const plano = linhas.join(" | ");
  const fora: Partial<EstadoAoVivo> = {};

  fora.avaliacao =
    dinheiro(apos(linhas, "Avaliação")) ?? dinheiroApos(plano, /VALOR DE AVALIA[ÇC][ÃA]O\s*:?/i, 40);
  const venda = dinheiro(apos(linhas, "Valor de venda"));
  const inicial = dinheiro(apos(linhas, "Lance inicial"));
  const atual = dinheiro(apos(linhas, "LANCE ATUAL"));
  fora.lance_minimo = venda ?? inicial;
  if (atual !== undefined && atual > 0) fora.lance_atual = atual;

  const data = paraISO(apos(linhas, "Data"));
  if (data) {
    fora.data_leilao = data;
    fora.data_fim = data;
  }
  const praca = /(\d)\s*[ªa]\s*pra[çc]a/i.exec(plano) ?? /(\d)\s*[ºo°]\s*leil[ãa]o/i.exec(plano);
  if (praca) fora.praca = Number(praca[1]);

  fora.fotos = fotosUnicas(
    [...html.matchAll(/(?:src|data-src)\s*=\s*["']([^"']*(?:fotos|lotes|imagens|upload)\/[^"']+)["']/gi)]
      .filter((m) => !/logo/i.test(m[1] ?? ""))
      .map((m) => absoluta(BASE + "/", m[1])),
  );

  fora.situacao = situacaoPorTexto(plano.slice(0, 5000)) ?? (fora.lance_minimo !== undefined ? "aberto" : "desconhecido");
  return fora;
}
