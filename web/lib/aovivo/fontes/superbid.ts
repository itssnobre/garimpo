// Superbid Exchange: a página do lote (Next.js) embute a oferta inteira em
// __NEXT_DATA__ -> props.pageProps.offerDetails.offers[0], no mesmo formato da API
// offer-query que collectors/superbid.py consome (offerDetail, offerStatus, auction).
import type { EstadoAoVivo } from "../tipos";
import { desescapar, dinheiro, fotosUnicas, lista, obj, paraISO, positivo, texto, texto0 } from "../comum";

function nextData(html: string): Record<string, unknown> {
  const m = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!m) return {};
  try {
    return obj(JSON.parse(m[1]!));
  } catch {
    return {};
  }
}

export async function extrair(html: string): Promise<Partial<EstadoAoVivo>> {
  const d = nextData(html);
  const pageProps = obj(obj(obj(d).props).pageProps);
  const oferta = obj(lista(obj(pageProps.offerDetails).offers)[0]);
  if (!Object.keys(oferta).length) {
    if (/n[ãa]o encontrad|p[áa]gina n[ãa]o existe|404/i.test(desescapar(html).slice(0, 3000))) {
      return { situacao: "indisponivel" };
    }
    return { situacao: "desconhecido" };
  }

  const det = obj(oferta.offerDetail);
  const st = obj(oferta.offerStatus);
  const auction = obj(oferta.auction);
  const produto = obj(oferta.product);

  const fora: Partial<EstadoAoVivo> = {};
  // mesma ordem do coletor: currentMinBid é o lance mínimo vigente
  fora.lance_minimo = positivo(det.currentMinBid) ?? positivo(det.initialBidValue) ?? positivo(oferta.price);
  const inicial = positivo(det.initialBidValue);
  const maior = positivo(det.currentMaxBid);
  if (maior !== undefined && inicial !== undefined && maior > inicial && Number(oferta.totalBids ?? 0) > 0) {
    fora.lance_atual = maior;
  }

  // A API não tem campo de avaliação. Mesma ordem do coletor: propriedade "avaliação"
  // do template -> "avaliado em R$ X" na descrição -> derivada do "Deságio (%)".
  const props: Record<string, string> = {};
  for (const g of lista(obj(produto.template).groups)) {
    for (const p of lista(obj(g).properties)) {
      const prop = obj(p);
      const k = texto0(prop.title || prop.name).trim().toLowerCase();
      const v = texto0(prop.value).trim();
      if (k && v) props[k] = v;
    }
  }
  for (const [k, v] of Object.entries(props)) {
    if (k.includes("avalia")) {
      const n = dinheiro(v);
      if (n !== undefined && n > 0) fora.avaliacao = n;
    }
  }
  if (fora.avaliacao === undefined) {
    const desc = texto(texto0(produto.detailedDescription));
    const achados = [...desc.matchAll(/avalia(?:[çc][aã]o|d[oa])[^R$\n]{0,60}R\$\s*([\d.,]+)/gi)]
      .map((m) => dinheiro(m[1]))
      .filter((v): v is number => v !== undefined && fora.lance_minimo !== undefined && v >= fora.lance_minimo);
    if (achados.length) fora.avaliacao = Math.max(...achados);
  }
  if (fora.avaliacao === undefined) {
    const d = dinheiro(props["deságio"] ?? props["desagio"]);
    if (d !== undefined && d > 0 && d < 100 && fora.lance_minimo !== undefined) {
      fora.avaliacao = Math.round((fora.lance_minimo / (1 - d / 100)) * 100) / 100;
    }
  }

  const fim = paraISO(texto0(oferta.endDate) || texto0(auction.endDate));
  if (fim) {
    fora.data_leilao = fim;
    fora.data_fim = fim;
  }
  const pd = texto0(auction.judicialPracaDescription).toLowerCase();
  const mp = /(\d)/.exec(pd);
  if (mp) fora.praca = Number(mp[1]);
  else if (/[úu]nica/.test(pd)) fora.praca = 1;

  fora.fotos = fotosUnicas(lista(produto.galleryJson).map((g) => texto0(obj(g).link)));

  fora.situacao = st.sold
    ? "vendido"
    : st.removed
      ? "retirado"
      : st.subjudice
        ? "suspenso"
        : st.closed || st.closedToBids
          ? "encerrado"
          : st.giveYourBid || st.makeYourProposal || st.available || st.wantToKnowThePrice
            ? "aberto"
            : "desconhecido";
  return fora;
}
