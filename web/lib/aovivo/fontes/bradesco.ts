// Bradesco (Vitrine de Leilões): API pública sem chave.
// GET https://api.vitrinebradesco.com.br/v1/auctions/<slug>.
// price = lance vigente; min_auction_value_1/2 + date_auction_1/2 são as praças
// (só nos lotes de alienação fiduciária).
import type { Imovel } from "../../types";
import type { EstadoAoVivo, Requisicao } from "../tipos";
import { fotosUnicas, lista, obj, paraISO, positivo, texto0 } from "../comum";

const API = "https://api.vitrinebradesco.com.br/v1/auctions";
const SITE = "https://vitrinebradesco.com.br";

export function pedido(i: Imovel): Requisicao {
  const slug = i.url.split("/auctions/")[1] ?? "";
  return {
    url: `${API}/${slug}`,
    cabecalhos: { Accept: "application/json", Origin: SITE, Referer: SITE + "/" },
  };
}

export async function extrair(corpo: string): Promise<Partial<EstadoAoVivo>> {
  let bruto: unknown;
  try {
    bruto = JSON.parse(corpo);
  } catch {
    return { situacao: "desconhecido" };
  }
  const env = obj(bruto);
  const x = obj(env.data ?? env);
  if (!Object.keys(x).length) return { situacao: "indisponivel" };

  const fora: Partial<EstadoAoVivo> = {};
  const v1 = positivo(x.min_auction_value_1);
  const v2 = positivo(x.min_auction_value_2);
  let preco = positivo(x.price);
  // parte dos registros devolve `price` em centavos enquanto min_auction_value_* vem em
  // reais; quando price bate com uma das praças multiplicado por 100, corrige a escala.
  const emCentavos = (ref?: number) => preco !== undefined && ref !== undefined && Math.abs(preco / 100 - ref) / ref < 0.02;
  if (emCentavos(v1) || emCentavos(v2)) preco = preco! / 100;
  fora.lance_minimo = preco;
  if (v1 !== undefined && preco !== undefined && v1 >= preco) fora.avaliacao = v1;

  const d1 = paraISO(texto0(x.date_auction_1));
  const d2 = paraISO(texto0(x.date_auction_2));
  const hoje = new Date().toISOString().slice(0, 10);
  if (d1 && d2) fora.praca = hoje > d1 ? 2 : 1;
  else if (d1) fora.praca = 1;
  const data = paraISO(texto0(x.auction_date)) ?? d2 ?? d1;
  if (data) {
    fora.data_leilao = data;
    fora.data_fim = d2 ?? data;
  }
  fora.fotos = fotosUnicas(lista(x.images).map((u) => texto0(u)));

  const st = `${texto0(x.status)} ${texto0(x.situation)} ${texto0(x.auction_status)}`.toLowerCase();
  fora.situacao = /vendid|arrematad|sold/.test(st)
    ? "vendido"
    : /suspens/.test(st)
      ? "suspenso"
      : /cancelad|retirad/.test(st)
        ? "retirado"
        : /encerrad|finalizad|closed/.test(st)
          ? "encerrado"
          : data && data < hoje
            ? "encerrado"
            : fora.lance_minimo !== undefined
              ? "aberto"
              : "desconhecido";
  return fora;
}
