// "Meu padrão": as regras são do usuário. Nada vem imposto; presets são só ponto de partida.
import type { Custos, Regras } from "./motor";
import { CUSTOS_PADRAO } from "./motor";

export interface Padrao extends Regras {
  id: string; nome: string; criadoEm: string; }
export interface _Campos {
  faixaMin: number; faixaMax: number;           // avaliação
  lanceMax: number;                              // 0 = sem teto (capital disponível)
  desagioMin: number; margemMin: number; margemAlvo: number;   // 0..1
  ufs: string[]; cidades: string[];              // vazio = Brasil inteiro
  tipos: string[]; modalidades: string[];        // vazio = todos
  ocupacao: "qualquer" | "desocupado";
  exigeFinanciamento: boolean;
  vetoFiduciante: boolean; vetoFracao: boolean; vetoEdital: boolean;
  quartosMin: number; areaMin: number; areaMax: number;   // perfil do imóvel, 0 = não exige
  custos: Custos;
}

export const UFS = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];
export const TIPOS = ["apartamento", "casa", "terreno", "comercial", "rural", "outro"];

export function novoPadrao(p: Partial<Padrao> = {}): Padrao {
  return { id: "p" + Math.random().toString(36).slice(2, 8), nome: "Meu padrão", faixaMin: 0, faixaMax: 0, lanceMax: 0, desagioMin: 0.3, margemMin: 0.25, margemAlvo: 0.3,
    ufs: [], cidades: [], tipos: [], modalidades: [], ocupacao: "qualquer", exigeFinanciamento: false,
    vetoFiduciante: true, vetoFracao: true, vetoEdital: false, quartosMin: 0, areaMin: 0, areaMax: 0, custos: { ...CUSTOS_PADRAO }, criadoEm: new Date().toISOString(), ...p };
}

export const PRESETS: { nome: string; desc: string; p: Partial<Padrao> }[] = [
  { nome: "Padrão Lotwise", desc: "Brasil inteiro, deságio 30%+, margem 25%+ (alvo 30%), vetos de diligência ligados. Bom primeiro padrão.", p: { desagioMin: 0.3, margemMin: 0.25, margemAlvo: 0.3, vetoFiduciante: true, vetoFracao: true } },
  { nome: "Conservador", desc: "Deságio 40%+, margem 30%+, só desocupado, vetos todos ligados.", p: { desagioMin: 0.4, margemMin: 0.3, margemAlvo: 0.35, ocupacao: "desocupado", vetoEdital: true } },
  { nome: "Revenda rápida", desc: "Apartamentos e casas até R$ 400 mil, deságio 35%+, margem 25%+.", p: { faixaMax: 400000, tipos: ["apartamento", "casa"], desagioMin: 0.35, margemMin: 0.25, margemAlvo: 0.3 } },
  { nome: "Apartamento 2+ quartos", desc: "Só apartamentos com 2 quartos ou mais e área informada, deságio 40%+, margem 25%+.", p: { tipos: ["apartamento"], quartosMin: 2, areaMin: 40, desagioMin: 0.4, margemMin: 0.25, margemAlvo: 0.3 } },
  { nome: "Renda (aluguel)", desc: "Apartamentos, aceita ocupado, deságio 30%+, margem 20%+.", p: { tipos: ["apartamento"], desagioMin: 0.3, margemMin: 0.2, margemAlvo: 0.25 } },
  { nome: "Em branco", desc: "Comece do zero e defina cada regra.", p: {} },
];

