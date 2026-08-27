// Índice enxuto: usado por todas as listas (vai para o cliente).
import indice from "../data/indice.json";
import meta from "../data/meta.json";
import type { Imovel, Meta } from "./types";

export const IMOVEIS = indice as unknown as Imovel[];
export const META = meta as Meta;
