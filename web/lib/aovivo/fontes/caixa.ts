// Caixa: a página de detalhe só responde por POST em detalhe-imovel.asp
// (o GET cai no bot manager). Mesmo endpoint que collectors/caixa.py usa.
import type { Imovel } from "../../types";
import type { EstadoAoVivo, Requisicao } from "../tipos";
import { absoluta, dinheiroApos, paraISO, fotosUnicas, texto } from "../comum";

const BASE = "https://venda-imoveis.caixa.gov.br";
const DETALHE = BASE + "/sistema/detalhe-imovel.asp";

export function pedido(i: Imovel): Requisicao {
  const cod = (i.id.split(":")[1] ?? "").replace(/\D/g, "");
  return {
    url: DETALHE,
    metodo: "POST",
    cabecalhos: { "Content-Type": "application/x-www-form-urlencoded", Referer: DETALHE },
    corpo: `hdnimovel=${encodeURIComponent(cod)}`,
    ausente: /Nenhum im[óo]vel encontrado/i,
  };
}

export async function extrair(html: string): Promise<Partial<EstadoAoVivo>> {
  const t = texto(html);
  const plano = t.replace(/\n/g, " ");
  const fora: Partial<EstadoAoVivo> = {};

  if (/Nenhum im[óo]vel encontrado/i.test(plano)) return { situacao: "indisponivel" };

  fora.avaliacao = dinheiroApos(plano, /Valor de avalia[çc][ãa]o/i, 60);
  fora.lance_minimo = dinheiroApos(plano, /Valor m[íi]nimo de venda/i, 60);

  // "Data do 1º Leilão - 08/09/2026" (leilão SFI tem 1º e 2º); demais têm uma data só
  const pracas: { n: number; data: string }[] = [];
  const re = /Data do (\d)[ºo°] Leil[ãa]o\s*-\s*(\d{2}\/\d{2}\/\d{4})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(plano))) {
    const d = paraISO(m[2]);
    if (d) pracas.push({ n: Number(m[1]), data: d });
  }
  if (pracas.length) {
    fora.data_leilao = pracas[0]!.data;
    fora.data_fim = pracas[pracas.length - 1]!.data;
    fora.praca = pracas[0]!.n;
    const l2 = dinheiroApos(plano, /2[ºo°] Leil[ãa]o\s*:/i, 40);
    const p2 = pracas.find((p) => p.n === 2);
    if (l2 !== undefined && fora.lance_minimo !== undefined && Math.abs(l2 - fora.lance_minimo) < 1 && p2) {
      fora.praca = 2;
      fora.data_leilao = p2.data;
    }
  } else {
    const uma = /Data d[ao] [^\n-]{0,40}?-\s*(\d{2}\/\d{2}\/\d{4})/.exec(plano);
    if (uma) {
      fora.data_leilao = paraISO(uma[1]);
      fora.data_fim = fora.data_leilao;
    }
  }

  const fotos: string[] = [];
  const rf = /(?:src|data-src)\s*=\s*["']([^"']*\/fotos\/[^"']+)["']/gi;
  while ((m = rf.exec(html))) {
    const u = absoluta(BASE, m[1]);
    if (u) fotos.push(u);
  }
  fora.fotos = fotosUnicas(fotos);

  // A Caixa não publica lance corrente na página de detalhe; só o valor mínimo.
  const encerrado = /im[óo]vel (?:vendido|indispon[íi]vel)|licita[çc][ãa]o encerrada|leil[ãa]o encerrado/i.exec(plano);
  fora.situacao = encerrado ? "encerrado" : fora.lance_minimo !== undefined ? "aberto" : "desconhecido";
  if (/im[óo]vel vendido/i.test(plano)) fora.situacao = "vendido";
  if (fora.avaliacao === undefined) delete fora.avaliacao;
  if (fora.lance_minimo === undefined) delete fora.lance_minimo;
  return fora;
}
