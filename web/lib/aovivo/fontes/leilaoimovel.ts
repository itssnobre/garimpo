// Leilão Imóvel: página HTML do lote (/imovel/<uf>/<cidade>/<slug>).
// Cuidado: o Cloudflare do site desafia clientes que não são navegador de verdade
// (o coletor Python precisa cair para `curl --http1.1`). No runtime Node o pedido
// costuma voltar 403 "Just a moment" e o motor devolve ok:false com o erro.
import type { EstadoAoVivo } from "../tipos";
import { blocos, dinheiro, dinheiroApos, fotosUnicas, paraISO, situacaoPorTexto, texto, textoPlano } from "../comum";

function valorDoBloco(html: string, classe: string): number | undefined {
  for (const b of blocos(html, classe)) {
    const v = dinheiro(texto(b));
    if (v !== undefined && v > 0) return v;
  }
  return undefined;
}

export async function extrair(html: string): Promise<Partial<EstadoAoVivo>> {
  const plano = textoPlano(html);
  const fora: Partial<EstadoAoVivo> = {};

  fora.avaliacao = valorDoBloco(html, "appraised") ?? dinheiroApos(plano, /Avalia[çc][ãa]o/i, 60);
  fora.lance_minimo = valorDoBloco(html, "discount-price") ?? dinheiroApos(plano, /Lance (?:m[íi]nimo|inicial)/i, 60);

  // praças: cada .bids .col-12 traz rótulo ("1ª praça"), data e valor
  const pracas: { n?: number; data?: string; valor?: number }[] = [];
  for (const bloco of blocos(html, "bids")) {
    for (const col of blocos(bloco, "col-12")) {
      const t = texto(col);
      if (!t.trim()) continue;
      const rot = /(\d)\s*[°ºªao]/.exec(t);
      pracas.push({
        n: rot ? Number(rot[1]) : undefined,
        data: paraISO(t),
        valor: dinheiro(/R\$\s*([\d.,]+)/.exec(t)?.[1]),
      });
    }
  }
  const hoje = new Date().toISOString().slice(0, 10);
  const vigente = pracas.find((p) => p.data && p.data >= hoje) ?? pracas[pracas.length - 1];
  if (vigente) {
    if (vigente.n) fora.praca = vigente.n;
    if (vigente.data) fora.data_leilao = vigente.data;
    if (vigente.valor) fora.lance_minimo = vigente.valor;
    const ultima = pracas[pracas.length - 1];
    if (pracas.length >= 2 && ultima?.data) fora.data_fim = ultima.data;
  }
  if (!fora.data_leilao) {
    const enc = /Encerra em[^\d]{0,40}(\d{2}\/\d{2}\/\d{4})/i.exec(plano);
    if (enc) fora.data_leilao = paraISO(enc[1]);
  }
  fora.data_fim = fora.data_fim ?? fora.data_leilao;

  const fotos: string[] = [];
  const re = /https:\/\/image\.leilaoimovel\.com\.br\/images\/[^"'\s\\]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) fotos.push(m[0]);
  fora.fotos = fotosUnicas(fotos);

  fora.situacao =
    situacaoPorTexto(plano.slice(0, 3000)) ??
    (/leil[ãa]o encerrado|lote encerrado|arrematad/i.test(plano) ? "encerrado" : undefined) ??
    (fora.lance_minimo !== undefined ? "aberto" : "desconhecido");
  return fora;
}
