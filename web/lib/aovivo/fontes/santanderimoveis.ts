// Santander Imóveis: página WordPress do lote, tudo server-side.
// "Valor avaliado", "Valor de venda / A partir de" e "Data do leilão" saem do texto;
// os valores vêm sem centavos ("R$ 419.000"), por isso `dinheiro` trata o ponto como milhar.
import type { EstadoAoVivo } from "../tipos";
import { dinheiroApos, dataApos, fotosUnicas, situacaoPorTexto, texto, textoPlano } from "../comum";

export async function extrair(html: string): Promise<Partial<EstadoAoVivo>> {
  const t = texto(html);
  const plano = t.replace(/\n/g, " | ");
  const fora: Partial<EstadoAoVivo> = {};

  fora.avaliacao = dinheiroApos(plano, /Valor avaliad[oa]/i, 60);
  fora.lance_minimo =
    dinheiroApos(plano, /Valor de venda[^|]*\|?\s*(?:A partir de)?/i, 60) ?? dinheiroApos(plano, /A partir de/i, 40);
  const data = dataApos(plano, /Data do leil[ãa]o/i, 80);
  if (data) {
    fora.data_leilao = data;
    fora.data_fim = data;
  }

  // galeria fica num JSON escapado dentro de property_vars.gallery
  const fotos: string[] = [];
  const g = /"gallery":"((?:\\.|[^"\\])*)"/.exec(html);
  if (g) {
    try {
      const cru = JSON.parse('"' + g[1] + '"') as string;
      for (const item of JSON.parse(cru) as unknown[]) {
        const o = item as Record<string, unknown>;
        const u = (o.full ?? o.small) as unknown;
        const url = Array.isArray(u) ? u[0] : u;
        if (typeof url === "string") fotos.push(url);
      }
    } catch {
      /* galeria ausente ou em outro formato: segue sem fotos */
    }
  }
  fora.fotos = fotosUnicas(fotos);

  const cabeca = textoPlano(html).slice(0, 3000);
  fora.situacao =
    /im[óo]vel vendido|venda encerrada|indispon[íi]vel/i.test(cabeca) ? "vendido"
    : /leil[ãa]o encerrado|encerrado/i.test(cabeca) ? "encerrado"
    : situacaoPorTexto(cabeca) ?? (fora.lance_minimo !== undefined ? "aberto" : "desconhecido");
  return fora;
}
