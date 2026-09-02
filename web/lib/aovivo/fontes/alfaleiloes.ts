// Alfa Leilões: API REST pública (Django REST Framework, sem auth para leitura).
// GET /api/lotes/<id>/ traz status, valores e datas; o leilão (/api/leiloes/<item>/)
// diz o estágio atual (1P/2P) e as datas das praças.
import type { Imovel } from "../../types";
import type { EstadoAoVivo, Requisicao } from "../tipos";
import { buscarJson, dinheiro, memo, obj, positivo, texto0 } from "../comum";

const API = "https://alfaleiloes.com/api";

export function pedido(i: Imovel): Requisicao {
  const id = (i.id.split(":")[1] ?? "").replace(/\D/g, "");
  return { url: `${API}/lotes/${id}/`, cabecalhos: { Accept: "application/json" } };
}

function iso(v: unknown): string | undefined {
  const s = texto0(v);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : undefined;
}

export async function extrair(corpo: string): Promise<Partial<EstadoAoVivo>> {
  let r: Record<string, unknown>;
  try {
    r = obj(JSON.parse(corpo));
  } catch {
    return { situacao: "desconhecido" };
  }
  if (!r.id) return { situacao: "indisponivel" };

  const fora: Partial<EstadoAoVivo> = {};
  const l1 = dinheiro(r.lance_1_data);
  const l2 = dinheiro(r.lance_2_data);
  const aval = dinheiro(r.avaliacao);
  if (aval !== undefined && aval > 0) fora.avaliacao = aval;

  const itemId = Number(r.item ?? 0);
  const lei = itemId
    ? obj(await memo(`alfa:leilao:${itemId}`, 60_000, () => buscarJson(`${API}/leiloes/${itemId}/`)))
    : {};
  const estagio = texto0(lei.estagio_atual).toUpperCase();
  const praca = estagio.startsWith("2") ? 2 : estagio.startsWith("1") ? 1 : undefined;
  if (praca) fora.praca = praca;

  fora.lance_minimo = positivo(r.valor_minimo) ?? positivo(r.min_venda) ?? (praca === 2 ? l2 : l1);
  const atual = positivo(r.valor_atual);
  if (atual !== undefined && fora.lance_minimo !== undefined && atual > fora.lance_minimo) fora.lance_atual = atual;

  const fim = iso(r.fechamento) ?? iso(praca === 2 ? lei.data_final2 : lei.data_final1);
  const ini = iso(praca === 2 ? lei.data_inicial2 : lei.data_inicial1);
  if (fim ?? ini) {
    fora.data_leilao = fim ?? ini;
    fora.data_fim = fim;
  }

  const st = texto0(r.status).toLowerCase();
  const stLei = texto0(lei.status).toLowerCase();
  const alvo = `${st} ${stLei}`;
  fora.situacao = /vendid|arrematad/.test(alvo)
    ? "vendido"
    : /suspens/.test(alvo)
      ? "suspenso"
      : /cancelad|retirad/.test(alvo)
        ? "retirado"
        : /encerrad|finalizad|fechad/.test(alvo)
          ? "encerrado"
          : /aberto|futuro|em breve/.test(st)
            ? "aberto"
            : "desconhecido";
  return fora;
}
