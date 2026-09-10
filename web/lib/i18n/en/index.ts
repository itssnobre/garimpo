// Dicionário PT → EN. Cada arquivo cobre um grupo de telas; a chave é o texto original em português.
import { componentesLote } from "./componentes-lote";
import { componentesLista } from "./componentes-lista";
import { telasApp } from "./telas-app";
import { site } from "./site";
import { api } from "./api";
import { base } from "./base";

export const EN: Record<string, string> = { ...base, ...componentesLote, ...componentesLista, ...telasApp, ...site, ...api };
