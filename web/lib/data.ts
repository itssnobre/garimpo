// Índice enxuto completo: SÓ no servidor (landing, cobertura). O cliente usa lib/indice.ts (por UF, sob demanda).
import "server-only";
import indice from "../data/indice.json";
import meta from "../data/meta.json";
import type { Imovel, Meta } from "./types";

export const IMOVEIS = indice as unknown as Imovel[];
export const META = meta as Meta;
