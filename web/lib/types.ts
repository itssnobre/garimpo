export type Modalidade = "leilao_sfi" | "licitacao_aberta" | "venda_online" | "venda_direta" | "judicial" | "extrajudicial" | "outro";

export interface Imovel {
  id: string; fonte: string; url: string; tipo: string; titulo: string;
  endereco?: string; bairro?: string; cidade: string; uf: string; cep?: string;
  area_privativa_m2?: number; area_terreno_m2?: number; quartos?: number; vagas?: number;
  avaliacao: number; lance_minimo: number; desagio_pct: number;
  modalidade: Modalidade; praca?: number; data_leilao?: string; data_fim?: string;
  ocupado?: boolean | null; aceita_financiamento?: boolean | null; aceita_fgts?: boolean | null;
  debitos_regra?: string; debitos_por_conta_comprador?: boolean | null;
  direitos_fiduciante: boolean; fracao_ideal: boolean; dominio_util?: boolean; massa_falida?: boolean; direitos_aquisitivos?: boolean; onus_averbado?: boolean; debitos_teto10?: boolean; foto?: string; valor_suspeito?: boolean; avaliacao_outra_fonte?: number;
  matricula?: string; cartorio?: string; edital_url?: string; matricula_url?: string;
  fotos?: string[]; descricao?: string; leiloeiro?: string; coletado_em: string;
  tambem_em?: { fonte: string; url: string; lance_minimo: number }[];
}

export interface Meta { gerado_em: string; total: number; fontes: Record<string, { lidos: number; validos: number }>; por_uf?: Record<string, number>; por_fonte?: Record<string, number>; disponiveis_total?: number; disponiveis_por_uf?: Record<string, number> }
