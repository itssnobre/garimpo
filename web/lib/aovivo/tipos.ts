import type { Imovel } from "../types";

/** Situação do lote na fonte, no momento da verificação. */
export type SituacaoAoVivo =
  | "aberto"
  | "encerrado"
  | "vendido"
  | "suspenso"
  | "retirado"
  | "indisponivel"
  | "desconhecido";

/** Retrato do lote na fonte, refeito ao vivo a partir da página/API original. */
export interface EstadoAoVivo {
  loteId: string;
  fonte: string;
  verificadoEm: string;
  ok: boolean;
  situacao: SituacaoAoVivo;
  lance_minimo?: number;
  lance_atual?: number;
  avaliacao?: number;
  data_leilao?: string;
  data_fim?: string;
  praca?: number;
  fotos?: string[];
  mudancas: string[];
  erro?: string;
}

/** Requisição que o extrator quer que o motor faça (padrão: GET na url do lote). */
export interface Requisicao {
  url: string;
  metodo?: "GET" | "POST";
  cabecalhos?: Record<string, string>;
  corpo?: string;
  /** Texto que, se aparecer no corpo, indica lote inexistente na fonte. */
  ausente?: RegExp;
}

/** O que o motor extrai de uma fonte. `extrair` recebe o corpo já lido em texto. */
export interface Extrator {
  pedido?: (i: Imovel) => Requisicao;
  extrair: (html: string, i: Imovel, resp: Response) => Promise<Partial<EstadoAoVivo>>;
}
