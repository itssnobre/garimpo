// Meta da coleta (pequeno): pode ir para o cliente.
import meta from "../data/meta.json";
import type { Meta } from "./types";
export const META = meta as Meta;
export const UFS_NOMES: Record<string, string> = { AC: "Acre", AL: "Alagoas", AM: "Amazonas", AP: "Amapá", BA: "Bahia", CE: "Ceará", DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás", MA: "Maranhão", MG: "Minas Gerais", MS: "Mato Grosso do Sul", MT: "Mato Grosso", PA: "Pará", PB: "Paraíba", PE: "Pernambuco", PI: "Piauí", PR: "Paraná", RJ: "Rio de Janeiro", RN: "Rio Grande do Norte", RO: "Rondônia", RR: "Roraima", RS: "Rio Grande do Sul", SC: "Santa Catarina", SE: "Sergipe", SP: "São Paulo", TO: "Tocantins" };
export const UFS_DISPONIVEIS = Object.keys(META.por_uf ?? {}).sort();
/** Lotes disponíveis (leilão aberto, sem veto, sem valor suspeito): é o que a lista mostra por padrão. */
export const DISPONIVEIS_TOTAL = META.disponiveis_total ?? META.total;
export const disponiveisUF = (uf: string) => META.disponiveis_por_uf?.[uf] ?? META.por_uf?.[uf] ?? 0;
