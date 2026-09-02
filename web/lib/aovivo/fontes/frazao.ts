// Frazão Leilões: página /lote/<id>-<slug>. A coluna direita traz o status em
// .lot-status ("Liberado para Lance"), "Leilão: dd/mm/aaaa", "Maior lance atual" e
// "Lance inicial". Avaliação só nos lotes que publicam "Valor Avaliado"/"Avaliação: R$ X"
// (Itaú e a maioria dos judiciais não publicam).
import type { EstadoAoVivo } from "../tipos";
import { blocos, dinheiroApos, dinheiroQualquer, dataApos, fotosUnicas, situacaoPorTexto, texto } from "../comum";

/** Fotos ficam no carrossel #carousel-photos / #container_photos. */
function fotos(html: string): string[] {
  const out: string[] = [];
  for (const id of ["carousel-photos", "container_photos"]) {
    const m = new RegExp(`id="${id}"`).exec(html);
    if (!m) continue;
    const trecho = html.slice(m.index, m.index + 20000);
    for (const f of trecho.matchAll(/(?:src|data-src)\s*=\s*["']([^"']+\.(?:jpe?g|png|webp)[^"']*)["']/gi)) {
      if (f[1]) out.push(f[1]);
    }
  }
  return out;
}

export async function extrair(html: string): Promise<Partial<EstadoAoVivo>> {
  const plano = texto(html).replace(/\n/g, " | ");
  const fora: Partial<EstadoAoVivo> = {};

  fora.lance_minimo = dinheiroApos(plano, /Lance inicial\s*:?/i, 50);
  const maior = dinheiroApos(plano, /Maior lance atual\s*:?/i, 50);
  if (maior !== undefined && maior > 0) fora.lance_atual = maior;
  // "Valor Avaliado" vem do sistema do banco em formato americano ("$92,000.00")
  const avaliado = /Valor Avaliado:?\s*\$?\s*([\d.,]+)/i.exec(plano);
  fora.avaliacao =
    (avaliado ? dinheiroQualquer(avaliado[1]) : undefined) ??
    dinheiroApos(plano, /Avalia[çc][ãa]o(?: do im[óo]vel)?\s*:?/i, 60) ??
    dinheiroApos(plano, /Avaliad[oa]\s+em/i, 50);

  const d1 = dataApos(plano, /1[ºo°] Leil[ãa]o\s*:?/i, 40);
  const d2 = dataApos(plano, /2[ºo°] Leil[ãa]o\s*:?/i, 40);
  const solta = dataApos(plano, /Leil[ãa]o\s*:/i, 40);
  const hoje = new Date().toISOString().slice(0, 10);
  const data = d1 && d2 ? (d1 < hoje ? d2 : d1) : (d1 ?? d2 ?? solta);
  if (data) {
    fora.data_leilao = data;
    fora.data_fim = d2 ?? data;
  }
  if (d1 && d2) fora.praca = d1 < hoje ? 2 : 1;

  fora.fotos = fotosUnicas(fotos(html));

  // o status oficial fica em .lot-status; o modal "leilão já encerrado" existe em toda
  // página (é template escondido) e por isso não serve de sinal.
  const status = texto(blocos(html, "lot-status")[0] ?? "");
  fora.situacao =
    situacaoPorTexto(status) ??
    situacaoPorTexto(plano.slice(0, 2500)) ??
    (fora.lance_minimo !== undefined ? "aberto" : "desconhecido");
  return fora;
}
