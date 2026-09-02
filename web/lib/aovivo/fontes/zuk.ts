// Portal Zuk: HTML do lote. A caixa de lance traz "Em leilão pelo valor de R$ X",
// "Lance inicial:" + "Data dd/mm/aa às HHhMM" e "Maior lance até agora".
// O Zuk não publica avaliação; quando o texto traz "Valor Alvo"/"avaliação R$ X" usamos isso.
import type { EstadoAoVivo } from "../tipos";
import { dinheiroAntes, dinheiroApos, fotosUnicas, paraISO, situacaoPorTexto, texto } from "../comum";

export async function extrair(html: string): Promise<Partial<EstadoAoVivo>> {
  const t = texto(html);
  const plano = t.replace(/\n/g, " | ");
  const fora: Partial<EstadoAoVivo> = {};

  fora.lance_minimo =
    dinheiroApos(plano, /Em leil[ãa]o pelo valor de/i, 40) ??
    dinheiroApos(plano, /Lance inicial\s*:/i, 60) ??
    dinheiroApos(plano, /Valor m[íi]nimo/i, 60);
  // o Zuk imprime o valor acima do rótulo ("R$ 0,00 | Maior lance até agora")
  const maior = dinheiroAntes(plano, /Maior lance at[ée] agora/i, 60);
  if (maior !== undefined && maior > 0 && (fora.lance_minimo === undefined || maior > fora.lance_minimo)) {
    fora.lance_atual = maior;
  }
  fora.avaliacao =
    dinheiroApos(plano, /avalia[çc][ãa]o/i, 50) ?? dinheiroApos(plano, /Valor Alvo\s*:/i, 40);

  // "Data | 08/09/26 às 12h58" logo abaixo do lance inicial
  const dt = /Data\s*\|\s*(\d{2}\/\d{2}\/\d{2,4})/.exec(plano) ?? /(\d{2}\/\d{2}\/\d{2,4})\s*às\s*\d{1,2}h/.exec(plano);
  const data = paraISO(dt?.[1]);
  if (data) {
    fora.data_leilao = data;
    fora.data_fim = data;
  }
  const praca = /(\d)\s*[ªa°º]\s*(?:pra[çc]a|leil[ãa]o)/i.exec(plano);
  if (praca) fora.praca = Number(praca[1]);

  fora.fotos = fotosUnicas(
    [...html.matchAll(/(?:src|data-src)\s*=\s*["'](https:\/\/imagens\.portalzuk\.com\.br\/detalhe\/[^"']+)["']/gi)].map(
      (m) => m[1],
    ),
  );

  const cabeca = plano.slice(0, 4000);
  fora.situacao =
    /lote (?:vendido|arrematado)|im[óo]vel vendido/i.test(cabeca) ? "vendido"
    : /leil[ãa]o encerrado|lote encerrado|encerrado para lances/i.test(cabeca) ? "encerrado"
    : /suspens/i.test(cabeca) ? "suspenso"
    : /retirad|cancelad/i.test(cabeca) ? "retirado"
    : situacaoPorTexto(cabeca) ?? (fora.lance_minimo !== undefined ? "aberto" : "desconhecido");
  return fora;
}
