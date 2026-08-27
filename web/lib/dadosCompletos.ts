// Dado completo do lote: só no servidor, na página do imóvel (não vai para o bundle do cliente).
import "server-only";
import imoveis from "../data/imoveis.json";
import type { Imovel } from "./types";

export const TODOS = imoveis as unknown as Imovel[];
export const byId = (id: string) => TODOS.find((i) => i.id === id);
