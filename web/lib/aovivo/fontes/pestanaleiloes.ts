// Pestana Leilões: API interna do portal (SPA React, HTML não traz nada).
// POST /api/v2/lote/por-ids {"ids":[<id>]} devolve o lote; as datas das praças ficam
// no leilão, que vem da lista GET /api/v2/leilao (cacheada por 2 min neste processo).
import type { Imovel } from "../../types";
import type { EstadoAoVivo, Requisicao } from "../tipos";
import { buscarJson, fotosUnicas, lista, memo, obj, positivo, texto0 } from "../comum";

const BASE = "https://www.pestanaleiloes.com.br";
const CDN_FOTO = "https://ged.pestanaleiloes.com.br/ged/";

export function pedido(i: Imovel): Requisicao {
  const id = Number((i.id.split(":")[1] ?? "").replace(/\D/g, ""));
  return {
    url: `${BASE}/api/v2/lote/por-ids`,
    metodo: "POST",
    cabecalhos: { "Content-Type": "application/json", Accept: "application/json", Origin: BASE, Referer: BASE + "/" },
    corpo: JSON.stringify({ ids: [id] }),
  };
}

function iso(v: unknown): string | undefined {
  const s = texto0(v);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : undefined;
}

async function leilao(id: number): Promise<Record<string, unknown>> {
  if (!id) return {};
  const todos = await memo(`pestana:leiloes`, 120_000, async () => {
    const j = await buscarJson<unknown[]>(`${BASE}/api/v2/leilao`, {
      cabecalhos: { Origin: BASE, Referer: BASE + "/" },
      timeoutMs: 12_000,
    });
    return lista(j);
  });
  return obj(todos.find((l) => Number(obj(l).id) === id));
}

export async function extrair(corpo: string): Promise<Partial<EstadoAoVivo>> {
  let bruto: unknown;
  try {
    bruto = JSON.parse(corpo);
  } catch {
    return { situacao: "desconhecido" };
  }
  const lotes = lista(bruto);
  if (!lotes.length) return { situacao: "indisponivel" };
  const lote = obj(lotes[0]);

  const fora: Partial<EstadoAoVivo> = {};
  const info = obj(lote.informacoesLei9514);
  const l1 = positivo(info.valorLeilao1);
  fora.lance_minimo = positivo(lote.lanceMinimo) ?? positivo(lote.valorInicial) ?? positivo(lote.lanceInicial);
  const maior = positivo(lote.maiorLance) ?? positivo(lote.valorAtual);
  if (maior !== undefined) fora.lance_atual = maior;

  for (const b of lista(obj(lote.valoresAdicionais).bens)) {
    const v = positivo(obj(b).avaliacaoLeiloeiro);
    if (v !== undefined) fora.avaliacao = v;
  }
  if (fora.avaliacao === undefined && info.pertenceLei && l1 !== undefined) fora.avaliacao = l1;

  const lei = await leilao(Number(lote.leilao ?? 0));
  const li = obj(lei.informacoesLei9514);
  const d1 = iso(li.dataLeilao1);
  const d2 = iso(li.dataLeilao2);
  const hoje = new Date().toISOString().slice(0, 10);
  if (info.pertenceLei && d1 && d2) fora.praca = hoje > d1 ? 2 : 1;
  const data = (fora.praca === 2 ? d2 : d1) ?? iso(lei.data);
  if (data) {
    fora.data_leilao = data;
    fora.data_fim = d2 ?? data;
  }

  const bem = obj(lista(lote.bens)[0]);
  fora.fotos = fotosUnicas(
    lista(bem.imagens).map((im) => {
      const o = obj(im);
      const nome = texto0(o.media || o.original);
      return nome ? CDN_FOTO + nome : "";
    }),
  );

  const st = texto0(lote.status).toLowerCase();
  const sid = String(lote.situacaoId ?? "");
  fora.situacao = /vendid|arrematad/.test(st)
    ? "vendido"
    : /suspens/.test(st)
      ? "suspenso"
      : /cancelad|retirad/.test(st)
        ? "retirado"
        : /encerrad|finalizad/.test(st)
          ? "encerrado"
          : sid === "1" || /dispon|pregão|pregao/.test(st)
            ? "aberto"
            : "desconhecido";
  return fora;
}
