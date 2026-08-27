// Motor de cálculo e score no padrão do sogro:
// margem líquida mínima 25% (alvo 30 a 35%), deságio >= 40%, faixa 200 a 250k, região Sorocaba/ABC, vetos de diligência.
import type { Imovel } from "./types";

export interface Custos {
  leiloeiro: number; itbi: number; registro: number;   // % sobre o lance
  advogado: number; certidoes: number;                 // R$ fixos
  debitos: number; desocupacao: number; reforma: number; // R$
  meses: number; mensal: number;                       // carrego (IPTU + condomínio + luz)
  corretagem: number; ir: number;                      // % sobre venda / % sobre ganho
  descontoVenda: number;                               // % abaixo da avaliação pra vender rápido
}

export const CUSTOS_PADRAO: Custos = {
  leiloeiro: 5, itbi: 2.5, registro: 1.2, advogado: 2500, certidoes: 500,
  debitos: 0, desocupacao: 0, reforma: 0, meses: 6, mensal: 500, corretagem: 6, ir: 15, descontoVenda: 5,
};

export const ITBI_CIDADE: Record<string, number> = {
  "Sorocaba": 2.5, "São Paulo": 3, "Jundiaí": 2.5, "Piracicaba": 3, "Osasco": 3, "Campinas": 2.7, "Guarulhos": 2,
  "São Bernardo do Campo": 2, "Santo André": 2, "São Caetano do Sul": 2, "Diadema": 2, "Mauá": 2, "Votorantim": 2, "Itu": 2,
};

export const REGIAO_SOROCABA = ["Sorocaba", "Votorantim", "Itu", "Salto", "Araçoiaba da Serra", "Piedade", "Itapetininga", "Tatuí",
  "Boituva", "Porto Feliz", "Mairinque", "São Roque", "Alumínio", "Iperó", "Capela do Alto", "Tietê", "Ibiúna", "Pilar do Sul", "Salto de Pirapora"];
export const REGIAO_ABC = ["São Bernardo do Campo", "Santo André", "São Caetano do Sul", "Diadema", "Mauá", "Ribeirão Pires", "Rio Grande da Serra"];
export const REGIAO_ALVO = [...REGIAO_SOROCABA, ...REGIAO_ABC];

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
export const naRegiao = (cidade: string) => REGIAO_ALVO.some((c) => norm(c) === norm(cidade));
export const regiaoDe = (cidade: string) =>
  REGIAO_SOROCABA.some((c) => norm(c) === norm(cidade)) ? "Sorocaba" : REGIAO_ABC.some((c) => norm(c) === norm(cidade)) ? "ABC" : "Outra";

export interface Resultado {
  venda: number; total: number; custosSobreLance: number; fixos: number; receita: number; lucro: number;
  margem: number;          // lucro líquido / capital total empregado
  descReal: number;        // 1 - total/venda
  lanceMax25: number; lanceMax30: number; lanceMax35: number;
}

export function calcular(avaliacao: number, lance: number, c: Custos): Resultado {
  const venda = avaliacao * (1 - c.descontoVenda / 100);
  const p = (c.leiloeiro + c.itbi + c.registro) / 100;
  const fixos = c.advogado + c.certidoes + c.debitos + c.desocupacao + c.reforma + c.meses * c.mensal;
  const total = lance * (1 + p) + fixos;
  const receita = venda * (1 - c.corretagem / 100);
  const ganho = Math.max(0, receita - total);
  const lucro = receita - total - ganho * (c.ir / 100);
  const margem = total > 0 ? lucro / total : 0;
  const descReal = venda > 0 ? 1 - total / venda : 0;
  // lance máximo que ainda entrega margem m: (receita - total)(1 - ir) = m * total
  const lanceMax = (m: number) => {
    const tot = (receita * (1 - c.ir / 100)) / (m + 1 - c.ir / 100);
    return Math.max(0, (tot - fixos) / (1 + p));
  };
  return { venda, total, custosSobreLance: lance * p, fixos, receita, lucro, margem, descReal,
    lanceMax25: lanceMax(0.25), lanceMax30: lanceMax(0.30), lanceMax35: lanceMax(0.35) };
}

export function custosPara(i: Imovel, base: Custos = CUSTOS_PADRAO): Custos {
  return { ...base, itbi: ITBI_CIDADE[i.cidade] ?? base.itbi, desocupacao: i.ocupado ? 8000 : i.ocupado === false ? 0 : 4000 };
}

export type Nivel = "veto" | "alerta" | "info";
export interface Sinal { nivel: Nivel; texto: string }

export function sinais(i: Imovel): Sinal[] {
  const s: Sinal[] = [];
  if (i.direitos_fiduciante) s.push({ nivel: "veto", texto: "Vende direitos de devedor fiduciante (dívida embutida). Nunca comprar." });
  if (i.fracao_ideal) s.push({ nivel: "veto", texto: "Fração ideal do imóvel (copropriedade). Nunca comprar." });
  if (!i.direitos_fiduciante && /\bdireitos\b/i.test(i.titulo)) s.push({ nivel: "alerta", texto: "Vende direitos sobre o imóvel (compromisso/posse), não a propriedade plena. Conferir na matrícula se há como registrar e quais ônus vêm junto." });
  if (i.direitos_aquisitivos && !i.direitos_fiduciante) s.push({ nivel: "alerta", texto: "Vende direitos sobre o imóvel (aquisitivos, do compromissário ou possessórios), não a propriedade registrada. Você entra no lugar de quem comprou e ainda não recebeu a escritura: confira na matrícula se dá para registrar em seu nome e o que falta pagar ao vendedor original." });
  if (i.dominio_util) s.push({ nivel: "alerta", texto: "Vende o domínio útil, não a propriedade (enfiteuse). O terreno é de outro dono, em geral a União: há foro anual, laudêmio de 5% sobre a avaliação da SPU na hora de revender, e a transferência depende de autorização. Financiamento é difícil e a revenda é mais lenta." });
  if (i.massa_falida) s.push({ nivel: "alerta", texto: "Bem de massa falida. A venda pelo juízo da falência costuma ser livre de ônus e sem sucessão de dívidas (art. 141, II da Lei 11.101/2005), o que é bom, mas confirme isso no edital. O rito é longo: conte meses até a carta de arrematação." });
  if (i.desagio_pct >= 0.85) s.push({ nivel: "alerta", texto: `Deságio de ${(i.desagio_pct * 100).toFixed(0)}%. Desconto desse tamanho quase nunca é oportunidade escondida: em geral o mercado já olhou o lote e recusou. Procure o motivo no edital e na matrícula antes de qualquer coisa.` });
  if (i.modalidade === "leilao_sfi" && i.debitos_por_conta_comprador !== false)
    s.push({ nivel: "alerta", texto: "Leilão SFI: débitos de condomínio costumam ser 100% do comprador, sem teto. Conferir matrícula por execução condominial." });
  if (i.modalidade === "licitacao_aberta") s.push({ nivel: "info", texto: "Licitação Aberta: Caixa costuma limitar condomínio a 10% da avaliação." });
  if (i.modalidade === "judicial") s.push({ nivel: "alerta", texto: "Judicial: avaliação pode estar inflada. Conferir comparáveis do laudo e a origem do imóvel (doação com retrocessão = veto)." });
  if (i.ocupado) s.push({ nivel: "alerta", texto: "Ocupado: prever desocupação (custo e prazo)." });
  if (i.ocupado === false) s.push({ nivel: "info", texto: "Desocupado." });
  if (i.debitos_por_conta_comprador) s.push({ nivel: "alerta", texto: "Regra da fonte: débitos por conta do comprador." });
  if (i.praca === 1) s.push({ nivel: "info", texto: "1ª praça: lance pode cair na 2ª." });
  if (i.aceita_financiamento) s.push({ nivel: "info", texto: "Aceita financiamento (não descapitaliza, liquidez maior)." });
  return s;
}

export interface Avaliacao { score: number; classe: "go" | "atencao" | "nogo"; motivos: string[]; res: Resultado; sinais: Sinal[]; regiao: string; passa: boolean }

export interface Criterios { faixaMin: number; faixaMax: number; desagioMin: number; margemMin: number; soRegiao: boolean }
export const CRITERIOS_PADRAO: Criterios = { faixaMin: 200000, faixaMax: 250000, desagioMin: 0.40, margemMin: 0.25, soRegiao: false };

export interface Regras { faixaMin: number; faixaMax: number; lanceMax: number; desagioMin: number; margemMin: number; margemAlvo: number; ufs: string[]; cidades: string[]; tipos: string[]; modalidades: string[]; ocupacao: "qualquer" | "desocupado"; exigeFinanciamento: boolean; vetoFiduciante: boolean; vetoFracao: boolean; vetoEdital: boolean; custos: Custos }

export const REGRAS_BASE: Regras = { faixaMin: 0, faixaMax: 0, lanceMax: 0, desagioMin: 0.3, margemMin: 0.25, margemAlvo: 0.3, ufs: [], cidades: [], tipos: [], modalidades: [], ocupacao: "qualquer", exigeFinanciamento: false, vetoFiduciante: true, vetoFracao: true, vetoEdital: false, custos: CUSTOS_PADRAO };

// Compatibilidade: avaliar() com os critérios antigos vira avaliarPadrao() com regras equivalentes.
export function avaliar(i: Imovel, crit: Criterios = CRITERIOS_PADRAO, custos?: Custos): Avaliacao {
  return avaliarPadrao(i, { ...REGRAS_BASE, faixaMin: crit.faixaMin, faixaMax: crit.faixaMax, desagioMin: crit.desagioMin, margemMin: crit.margemMin, custos: custos ?? CUSTOS_PADRAO });
}

const nrm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// Score de 0 a 100 sobre as regras do usuário. "passa" = cumpre todos os limites duros do padrão.
export function avaliarPadrao(i: Imovel, r: Regras): Avaliacao {
  const c = { ...r.custos, itbi: ITBI_CIDADE[i.cidade] ?? r.custos.itbi, desocupacao: r.custos.desocupacao || (i.ocupado ? 8000 : i.ocupado === false ? 0 : 4000) };
  const res = calcular(i.avaliacao, i.lance_minimo, c);
  const sg = sinais(i).filter((s) => !(s.nivel === "veto" && ((i.direitos_fiduciante && !r.vetoFiduciante) || (i.fracao_ideal && !r.vetoFracao))));
  const regiao = regiaoDe(i.cidade);
  const naRegiao = (r.ufs.length === 0 || r.ufs.includes(i.uf)) && (r.cidades.length === 0 || r.cidades.some((cd) => nrm(cd) === nrm(i.cidade)));
  const motivos: string[] = [];
  if (sg.some((x) => x.nivel === "veto")) return { score: 0, classe: "nogo", motivos: ["Veto do seu padrão"], res, sinais: sg, regiao, passa: false };
  const naFaixa = (r.faixaMin <= 0 || i.avaliacao >= r.faixaMin) && (r.faixaMax <= 0 || i.avaliacao <= r.faixaMax) && (r.lanceMax <= 0 || i.lance_minimo <= r.lanceMax);
  const limites = [naFaixa, i.desagio_pct >= r.desagioMin, res.margem >= r.margemMin, naRegiao,
    r.tipos.length === 0 || r.tipos.includes(i.tipo), r.modalidades.length === 0 || r.modalidades.includes(i.modalidade),
    r.ocupacao === "qualquer" || i.ocupado === false, !r.exigeFinanciamento || i.aceita_financiamento === true];
  const passa = limites.every(Boolean);
  let score = 0;
  if (res.margem >= r.margemAlvo + 0.05) score += 45; else if (res.margem >= r.margemAlvo) score += 38; else if (res.margem >= r.margemMin) score += 25; else if (res.margem >= r.margemMin - 0.1) score += 8;
  motivos.push(`Margem líquida ${(res.margem * 100).toFixed(0)}%`);
  if (i.desagio_pct >= r.desagioMin + 0.1) score += 20; else if (i.desagio_pct >= r.desagioMin) score += 15; else if (i.desagio_pct >= r.desagioMin - 0.1) score += 5;
  motivos.push(`Deságio ${(i.desagio_pct * 100).toFixed(0)}%`);
  if (naFaixa) { score += 10; if (r.faixaMin > 0 || r.faixaMax > 0 || r.lanceMax > 0) motivos.push("Na faixa"); }
  if (naRegiao) { score += 10; if (r.ufs.length || r.cidades.length) motivos.push("Na região"); }
  const alertas = sg.filter((x) => x.nivel === "alerta").length;
  score += Math.max(0, 15 - alertas * 5);
  if (i.ocupado === false) score += 3;
  if (i.aceita_financiamento) score += 2;
  score = Math.min(100, score);
  const classe = passa && score >= 60 ? "go" : score >= 40 ? "atencao" : "nogo";
  return { score, classe, motivos, res, sinais: sg, regiao, passa };
}

export { brl, pct } from "./fmt";
export const MODALIDADE_LABEL: Record<string, string> = {
  leilao_sfi: "Leilão SFI", licitacao_aberta: "Licitação Aberta", venda_online: "Venda Online", venda_direta: "Venda Direta",
  judicial: "Judicial", extrajudicial: "Extrajudicial", outro: "Outro",
};
export const FONTE_LABEL: Record<string, string> = {
  caixa: "Caixa", zuk: "Portal Zuk", megaleiloes: "Mega Leilões", superbid: "Superbid", sodresantoro: "Sodré Santoro",
  leilaoimovel: "Leilão Imóvel", frazao: "Frazão", biasi: "Biasi", lancejudicial: "Lance Judicial", santanderimoveis: "Santander",
  bradesco: "Bradesco", emgea: "Emgea", itau: "Itaú",
};
