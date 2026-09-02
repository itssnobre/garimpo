// Biasi Leilões: /sale/detail?id=<id>. Status em .lot-status/"Liberado para Lance",
// "Lance Inicial - R$ x", "Lance Atual: R$ x", data em #DataLeilao (ISO no value)
// e avaliação em "Valor alvo do Banco para Venda" / "Avaliação".
import type { Imovel } from "../../types";
import type { EstadoAoVivo, Requisicao } from "../tipos";
import { blocos, dinheiroApos, fotosUnicas, paraISO, situacaoPorTexto, texto } from "../comum";

const BASE = "https://www.biasileiloes.com.br";

export function pedido(i: Imovel): Requisicao {
  const id = (i.id.split(":")[1] ?? "").replace(/\D/g, "");
  return { url: `${BASE}/sale/detail?id=${id}`, cabecalhos: { Referer: BASE + "/" } };
}

export async function extrair(html: string): Promise<Partial<EstadoAoVivo>> {
  const plano = texto(html).replace(/\n/g, " | ");
  const fora: Partial<EstadoAoVivo> = {};

  fora.lance_minimo =
    dinheiroApos(plano, /Lance Inicial\s*[-:]?/i, 50) ?? dinheiroApos(plano, /1[º°]\s*Leil[ãa]o/i, 60);
  const atual = dinheiroApos(plano, /Lance Atual\s*:?/i, 40);
  if (atual !== undefined && atual > 0) fora.lance_atual = atual;
  fora.avaliacao =
    dinheiroApos(plano, /Valor alvo do Banco para Venda\s*:?/i, 50) ??
    dinheiroApos(plano, /(?:Valor de )?Avalia[çc][ãa]o\s*[-:]?/i, 50);

  const dl = /id="DataLeilao"[^>]*value="([^"]*)"/i.exec(html);
  const data = paraISO(dl?.[1]) ?? paraISO(plano);
  if (data) {
    fora.data_leilao = data;
    fora.data_fim = data;
  }

  // praças: <h4> com "leilão"; a passada leva a classe "expired"
  const h4 = [...html.matchAll(/<h4\b([^>]*)>([\s\S]{0,300}?)<\/h4>/gi)]
    .map((m) => ({ classe: m[1] ?? "", txt: texto(m[2] ?? "") }))
    .filter((x) => /leil[ãa]o/i.test(x.txt));
  if (h4.length >= 2) fora.praca = /expired/i.test(h4[0]!.classe) ? 2 : 1;
  else if (h4.length === 1) fora.praca = 1;

  fora.fotos = fotosUnicas(
    [...html.matchAll(/id="carousel-photos"[\s\S]{0,20000}/g)].flatMap((bloco) =>
      [...bloco[0].matchAll(/<img[^>]+src\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]),
    ),
  );

  const status = texto(blocos(html, "lot-status")[0] ?? "");
  fora.situacao =
    situacaoPorTexto(status) ??
    situacaoPorTexto(plano.slice(0, 2500)) ??
    (fora.lance_minimo !== undefined ? "aberto" : "desconhecido");
  return fora;
}
