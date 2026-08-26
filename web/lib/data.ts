import imoveis from "../data/imoveis.json";
import meta from "../data/meta.json";
import type { Imovel, Meta } from "./types";

export const IMOVEIS = imoveis as Imovel[];
export const META = meta as Meta;
export const byId = (id: string) => IMOVEIS.find((i) => i.id === id);
