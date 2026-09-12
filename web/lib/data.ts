// Resumo da coleta (contagens por fonte, estado e cidade). O catálogo em si vive no banco,
// em lib/catalogo.ts: este arquivo carrega só o meta, que tem alguns kB.
import "server-only";
import meta from "../data/meta.json";
import type { Meta } from "./types";

export const META = meta as Meta;
