// Leilões Judiciais Serrano: API JSON pública (api.leiloesjudiciais.com.br).
// POST core/api/get-lotes?lote_id=<id> devolve o lote; GET core/api/get-leiloes?leilao_id=<id>
// devolve a data vigente do leilão e o rótulo da praça. Mesma leitura de valores do
// collectors/leiloesjudiciais.py: vl_lanceminimo = AVALIAÇÃO, vl_lanceinicial = 1ª praça,
// vl_lanceinicialsegundoleilao = 2ª praça, vl_lance = maior lance.
import type { Imovel } from "../../types";
import type { EstadoAoVivo, Requisicao } from "../tipos";
import { buscarJson, lista, memo, obj, paraISO, positivo, texto0 } from "../comum";

const API = "https://api.leiloesjudiciais.com.br/core/api/";

const PARAMS_LOTE =
  "pg=1&qtd_por_pagina=1&tipo=3&estado=0&cidade=0&valor_min=0&valor_max=0&palavra_chave=" +
  "&leilao_id=0&ordenacao=crescente&ehvitrinesaladisputa=false&faixa_desconto=0&com_foto=0&categoria=";

export function pedido(i: Imovel): Requisicao {
  const loteId = (i.id.split(":")[1] ?? "").replace(/\D/g, "");
  return {
    url: `${API}get-lotes?${PARAMS_LOTE}&lote_id=${loteId}`,
    metodo: "POST",
    cabecalhos: { Accept: "application/json" },
  };
}

/** Praça vigente: compara a data atual do leilão com as datas rotuladas "Encerramento 1/2". */
function praca(leilao: Record<string, unknown>): number | undefined {
  if (leilao.leilao_id_primeiroleilao) return 2;
  const atual = texto0(leilao.dt).slice(0, 16);
  for (const x of lista(leilao.datas)) {
    const d = obj(x);
    const rot = Number(d.statusrotuloleilao_multiplas);
    if (texto0(d.dt).slice(0, 16) === atual && (rot === 3 || rot === 4)) {
      const n = Number(d.nu_ordemrotulo ?? 1);
      return Number.isFinite(n) ? n : undefined;
    }
  }
  return undefined;
}

export async function extrair(corpo: string): Promise<Partial<EstadoAoVivo>> {
  let bruto: unknown;
  try {
    bruto = JSON.parse(corpo);
  } catch {
    return { situacao: "desconhecido" };
  }
  const itens = lista(obj(bruto).items);
  if (!itens.length) return { situacao: "indisponivel" };
  const lote = obj(itens[0]);

  const fora: Partial<EstadoAoVivo> = {};
  const aval = positivo(lote.vl_lanceminimo);
  const l1 = positivo(lote.vl_lanceinicial);
  const l2 = positivo(lote.vl_lanceinicialsegundoleilao);
  const atual = positivo(lote.vl_lance);

  const leilaoId = Number(lote.leilao_id ?? 0);
  let leilao: Record<string, unknown> = {};
  if (leilaoId) {
    const j = await memo(`lj:leilao:${leilaoId}`, 60_000, () =>
      buscarJson(`${API}get-leiloes?pg=1&ativo=true&ordenacao=crescente&leilao_id=${leilaoId}`),
    );
    leilao = obj(lista(obj(j).items)[0]);
  }
  const p = praca(leilao);
  if (p) fora.praca = p;
  const base = p === 2 && l2 ? l2 : l1;
  fora.lance_minimo = base;
  if (atual !== undefined) fora.lance_atual = atual;
  if (aval !== undefined) fora.avaliacao = aval;

  const data = paraISO(texto0(leilao.dt)) ?? paraISO(texto0(lote.dt_fechamento));
  if (data) {
    fora.data_leilao = data;
    fora.data_fim = data;
  }
  const fotos = lista(lote.fotos)
    .map((f) => {
      const o = obj(f);
      return o.nm_path && o.nm_path_incompleto ? `${texto0(o.nm_path_incompleto)}640x480/${texto0(o.nm_path)}` : "";
    })
    .filter(Boolean);
  if (fotos.length) fora.fotos = fotos.slice(0, 12);

  const st = texto0(lote.nm_statuslote).toLowerCase();
  const idSt = String(lote.statuslote_id ?? "");
  fora.situacao = /vendid|arrematad/.test(st)
    ? "vendido"
    : /suspens/.test(st)
      ? "suspenso"
      : /cancelad|retirad/.test(st)
        ? "retirado"
        : /encerrad|finalizad/.test(st)
          ? "encerrado"
          : idSt === "1" || /abert/.test(st)
            ? "aberto"
            : "desconhecido";
  return fora;
}
