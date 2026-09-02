// Resale (e o white-label Emgea, que roda o mesmo backend): API REST no API Gateway.
// GET <base>/property/<codigo> com X-API-KEY + Origin, igual a collectors/resale.py.
import type { Imovel } from "../../types";
import type { EstadoAoVivo, Requisicao } from "../tipos";
import { fotosUnicas, lista, obj, paraISO, positivo, texto0 } from "../comum";

interface Config {
  base: string;
  chave: string;
  origem: string;
}

export const CONFIGS: Record<string, Config> = {
  resale: {
    base: "https://q3jhhgksa9.execute-api.us-east-2.amazonaws.com/prod",
    chave: "TFqvYJxuhO67Bo5WOzspQ6UENhuIZFVvrhLIcCig",
    origem: "https://www.resale.com.br",
  },
  emgea: {
    base: "https://yfvun6xbh1.execute-api.us-east-2.amazonaws.com/prod/emgea",
    chave: "rTV9MjnNrg86r6cFRU7O71QWsmUmJ2F83KcglBTy",
    origem: "https://www.emgeaimoveis.com.br",
  },
};

export function pedido(i: Imovel): Requisicao {
  const cfg = CONFIGS[i.fonte] ?? CONFIGS.resale!;
  const codigo = i.id.split(":").slice(1).join(":");
  return {
    url: `${cfg.base}/property/${encodeURIComponent(codigo)}`,
    cabecalhos: {
      "X-API-KEY": cfg.chave,
      Origin: cfg.origem,
      Referer: cfg.origem + "/",
      Accept: "application/json",
    },
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
  const d = obj(env.data ?? env);
  if (!Object.keys(d).length) return { situacao: "indisponivel" };

  const vals = obj(d.valores);
  const fora: Partial<EstadoAoVivo> = {};
  fora.lance_minimo = positivo(vals.valor_venda) ?? positivo(vals.valor_a_vista);
  fora.avaliacao = positivo(vals.valor_avaliado);
  const data = paraISO(texto0(d.data_limite));
  if (data) {
    fora.data_leilao = data;
    fora.data_fim = data;
  }
  const fotos = lista(d.imagens)
    .map((im) => texto0(obj(im).url))
    .filter(Boolean);
  fora.fotos = fotosUnicas(fotos);

  const status = texto0(d.status_da_venda).toLowerCase();
  fora.situacao =
    status === "" || status === "ativo"
      ? "aberto"
      : /vendid|arrematad/.test(status)
        ? "vendido"
        : /suspens/.test(status)
          ? "suspenso"
          : /cancelad|retirad/.test(status)
            ? "retirado"
            : /encerrad|inativ|finalizad/.test(status)
              ? "encerrado"
              : "desconhecido";
  return fora;
}
