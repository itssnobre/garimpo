// Dado completo do lote: só no servidor, na página do imóvel (não vai para o bundle do cliente).
import "server-only";
import imoveis from "../data/imoveis.json";
import type { Imovel } from "./types";

export const TODOS = imoveis as unknown as Imovel[];

// Índice id -> lote montado uma vez no módulo: a busca linear em 30 mil lotes era O(n) por id.
const PORID = new Map<string, Imovel>(TODOS.map((i) => [i.id, i]));

export const byId = (id: string): Imovel | undefined => PORID.get(id);
