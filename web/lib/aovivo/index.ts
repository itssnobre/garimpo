// Camada "ao vivo": refaz o fetch da página/API de origem de um lote e devolve o
// estado atual (situação, lance, avaliação, datas), comparando com o que está no
// catálogo para listar o que mudou. Só fetch: nada de navegador headless, porque
// isto roda em função serverless.
import type { Imovel } from "../types";
import type { EstadoAoVivo, Extrator, Requisicao, SituacaoAoVivo } from "./tipos";
import { CABECALHOS_PADRAO } from "./comum";

import * as alfaleiloes from "./fontes/alfaleiloes";
import * as biasi from "./fontes/biasi";
import * as bomvalor from "./fontes/bomvalor";
import * as bradesco from "./fontes/bradesco";
import * as caixa from "./fontes/caixa";
import * as fidalgoleiloes from "./fontes/fidalgoleiloes";
import * as frazao from "./fontes/frazao";
import * as generico from "./fontes/generico";
import * as lancejudicial from "./fontes/lancejudicial";
import * as leilaoimovel from "./fontes/leilaoimovel";
import * as leiloesjudiciais from "./fontes/leiloesjudiciais";
import * as megaleiloes from "./fontes/megaleiloes";
import * as pestanaleiloes from "./fontes/pestanaleiloes";
import * as resale from "./fontes/resale";
import * as santanderimoveis from "./fontes/santanderimoveis";
import * as superbid from "./fontes/superbid";
import * as zuk from "./fontes/zuk";

export type { EstadoAoVivo, SituacaoAoVivo } from "./tipos";

const TIMEOUT_MS = 12_000;
const POR_FONTE = 2; // no máximo 2 fetches simultâneos na mesma fonte

/** Fontes com extrator dedicado. As demais caem no genérico. */
const EXTRATORES: Record<string, Extrator> = {
  caixa,
  leilaoimovel,
  resale,
  leiloesjudiciais,
  superbid,
  megaleiloes,
  santanderimoveis,
  pestanaleiloes,
  zuk,
  fidalgoleiloes,
  frazao,
  biasi,
  alfaleiloes,
  lancejudicial,
  bomvalor,
  bradesco,
  emgea: resale, // white-label da Resale: mesma API, outra chave
};

/** Fonte tem parser próprio (útil para relatórios e testes). */
export function temExtratorDedicado(fonte: string): boolean {
  return fonte in EXTRATORES;
}

/** Sinal de "lote não existe mais", procurado só no título e no topo da página. */
const AUSENTE_PADRAO =
  /(p[áa]gina|im[óo]vel|lote|an[úu]ncio|conte[úu]do)\s+n[ãa]o\s+(foi\s+)?(encontrad|localizad|exist)|erro\s*404|404\s*[-–]\s*(not\s+found|p[áa]gina)/i;

/** Título + começo do texto: onde as fontes põem "página não encontrada". */
function topoDaPagina(corpo: string): string {
  const titulo = /<title[^>]*>([\s\S]{0,300}?)<\/title>/i.exec(corpo)?.[1] ?? "";
  return titulo + " " + corpo.slice(0, 4000).replace(/<[^>]+>/g, " ");
}

// ---------------------------------------------------------------- formatação

function brl(v: number): string {
  const casas = Number.isInteger(v) ? 0 : 2;
  return "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

function diaMes(iso?: string): string {
  if (!iso) return "sem data";
  const p = iso.split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}` : iso;
}

const ROTULO_SITUACAO: Record<SituacaoAoVivo, string> = {
  aberto: "Leilão aberto",
  encerrado: "Leilão encerrado",
  vendido: "Lote vendido",
  suspenso: "Leilão suspenso",
  retirado: "Lote retirado",
  indisponivel: "Lote indisponível na fonte",
  desconhecido: "Situação não identificada na fonte",
};

/** Diferenças entre o lote guardado e o que a fonte mostra agora, em português. */
function comparar(i: Imovel, e: EstadoAoVivo): string[] {
  const m: string[] = [];
  const mudouDinheiro = (a: number | undefined | null, b: number | undefined | null) =>
    a != null && b != null && a > 0 && b > 0 && Math.abs(a - b) >= 0.01;

  if (mudouDinheiro(i.lance_minimo, e.lance_minimo)) {
    m.push(`Lance mínimo mudou de ${brl(i.lance_minimo)} para ${brl(e.lance_minimo!)}`);
  }
  if (mudouDinheiro(i.avaliacao, e.avaliacao)) {
    m.push(`Avaliação mudou de ${brl(i.avaliacao)} para ${brl(e.avaliacao!)}`);
  }
  if (e.lance_atual != null && e.lance_atual > 0) {
    const base = e.lance_minimo ?? i.lance_minimo;
    if (base == null || e.lance_atual > base) m.push(`Já tem lance: ${brl(e.lance_atual)}`);
  }
  if (e.data_leilao && i.data_leilao && e.data_leilao !== i.data_leilao) {
    m.push(`Data mudou de ${diaMes(i.data_leilao)} para ${diaMes(e.data_leilao)}`);
  } else if (e.data_leilao && !i.data_leilao) {
    m.push(`Data do leilão: ${diaMes(e.data_leilao)}`);
  }
  if (e.praca != null && i.praca != null && e.praca !== i.praca) {
    m.push(`Praça mudou de ${i.praca}ª para ${e.praca}ª`);
  }
  if (e.situacao !== "aberto" && e.situacao !== "desconhecido") m.push(ROTULO_SITUACAO[e.situacao]);
  return m;
}

// ---------------------------------------------------------------- verificação

function agora(): string {
  return new Date().toISOString();
}

function vazio(i: Imovel, extra: Partial<EstadoAoVivo>): EstadoAoVivo {
  return { loteId: i.id, fonte: i.fonte, verificadoEm: agora(), ok: false, situacao: "desconhecido", mudancas: [], ...extra };
}

function mensagemDeRede(e: unknown): string {
  const err = e as { name?: string; message?: string; cause?: { code?: string; message?: string } };
  if (err?.name === "AbortError" || err?.name === "TimeoutError") return `Sem resposta em ${TIMEOUT_MS / 1000}s (timeout)`;
  const codigo = err?.cause?.code ?? "";
  if (codigo === "UNABLE_TO_VERIFY_LEAF_SIGNATURE" || codigo === "CERT_HAS_EXPIRED" || codigo === "SELF_SIGNED_CERT_IN_CHAIN") {
    return `Certificado TLS inválido no site da fonte (${codigo})`;
  }
  if (codigo === "ENOTFOUND" || codigo === "EAI_AGAIN") return "Domínio da fonte não resolveu (DNS)";
  if (codigo === "ECONNREFUSED" || codigo === "ECONNRESET") return "Conexão recusada pela fonte";
  const causa = err?.cause?.message ?? "";
  if (/redirect count exceeded/i.test(causa)) return "Redirecionamento em laço na fonte (exige cookie de sessão)";
  return `Falha de rede: ${err?.message ?? String(e)}${causa ? ` (${causa})` : ""}`;
}

/** Refaz o fetch do lote na fonte e devolve o estado atual. Nunca lança. */
export async function verificarLote(i: Imovel): Promise<EstadoAoVivo> {
  const extrator = EXTRATORES[i.fonte] ?? generico;
  let req: Requisicao;
  try {
    req = extrator.pedido ? extrator.pedido(i) : { url: i.url };
  } catch (e) {
    return vazio(i, { erro: `Não deu para montar a requisição: ${(e as Error).message}` });
  }
  if (!req.url || !/^https?:/i.test(req.url)) return vazio(i, { erro: "Lote sem URL de origem utilizável" });

  const ctrl = new AbortController();
  const relogio = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let resp: Response;
  let corpo: string;
  try {
    resp = await fetch(req.url, {
      method: req.metodo ?? "GET",
      headers: { ...CABECALHOS_PADRAO, ...(req.cabecalhos ?? {}) },
      body: req.corpo,
      redirect: "follow",
      signal: ctrl.signal,
    });
    corpo = await resp.text();
  } catch (e) {
    return vazio(i, { erro: mensagemDeRede(e) });
  } finally {
    clearTimeout(relogio);
  }

  if (resp.status === 404 || resp.status === 410) {
    const fora: EstadoAoVivo = {
      loteId: i.id,
      fonte: i.fonte,
      verificadoEm: agora(),
      ok: true,
      situacao: "indisponivel",
      mudancas: [],
    };
    fora.mudancas = comparar(i, fora);
    return fora;
  }
  if (resp.status === 403 || resp.status === 429) {
    return vazio(i, { erro: `Fonte bloqueou a consulta (HTTP ${resp.status}); a página exige navegador` });
  }
  if (!resp.ok) return vazio(i, { erro: `A fonte respondeu HTTP ${resp.status}` });

  const ausente = req.ausente ? req.ausente.test(corpo) : AUSENTE_PADRAO.test(topoDaPagina(corpo));
  if (ausente) {
    const fora: EstadoAoVivo = {
      loteId: i.id,
      fonte: i.fonte,
      verificadoEm: agora(),
      ok: true,
      situacao: "indisponivel",
      mudancas: [],
    };
    fora.mudancas = comparar(i, fora);
    return fora;
  }

  let parcial: Partial<EstadoAoVivo>;
  try {
    parcial = await extrator.extrair(corpo, i, resp);
  } catch (e) {
    return vazio(i, { erro: `Não deu para ler a página da fonte: ${(e as Error).message}` });
  }

  const fora: EstadoAoVivo = {
    loteId: i.id,
    fonte: i.fonte,
    verificadoEm: agora(),
    ok: true,
    situacao: parcial.situacao ?? "desconhecido",
    mudancas: [],
  };
  if (parcial.lance_minimo !== undefined) fora.lance_minimo = parcial.lance_minimo;
  if (parcial.lance_atual !== undefined) fora.lance_atual = parcial.lance_atual;
  if (parcial.avaliacao !== undefined) fora.avaliacao = parcial.avaliacao;
  if (parcial.data_leilao) fora.data_leilao = parcial.data_leilao;
  if (parcial.data_fim) fora.data_fim = parcial.data_fim;
  if (parcial.praca !== undefined) fora.praca = parcial.praca;
  if (parcial.fotos?.length) fora.fotos = parcial.fotos;
  fora.mudancas = comparar(i, fora);
  return fora;
}

type Pendente = { im: Imovel; idx: number } | null;

/**
 * Verifica vários lotes com limite global de concorrência e, dentro dele,
 * no máximo 2 requisições simultâneas por fonte (para não apanhar rate limit).
 */
export async function verificarLotes(lista: Imovel[], concorrencia = 4): Promise<EstadoAoVivo[]> {
  const saida: EstadoAoVivo[] = new Array(lista.length);
  const pendentes: Pendente[] = lista.map((im, idx) => ({ im, idx }));
  const emVoo = new Map<string, number>();
  let restantes = pendentes.length;

  async function trabalhador(): Promise<void> {
    for (;;) {
      let k = -1;
      for (let j = 0; j < pendentes.length; j++) {
        const p = pendentes[j];
        if (!p) continue;
        if ((emVoo.get(p.im.fonte) ?? 0) < POR_FONTE) {
          k = j;
          break;
        }
      }
      if (k < 0) {
        if (restantes === 0) return;
        await new Promise((r) => setTimeout(r, 50)); // só há pendentes de fontes saturadas
        continue;
      }
      const p = pendentes[k]!;
      pendentes[k] = null;
      restantes--;
      emVoo.set(p.im.fonte, (emVoo.get(p.im.fonte) ?? 0) + 1);
      try {
        saida[p.idx] = await verificarLote(p.im);
      } catch (e) {
        saida[p.idx] = vazio(p.im, { erro: `Falha inesperada: ${(e as Error).message}` });
      } finally {
        emVoo.set(p.im.fonte, (emVoo.get(p.im.fonte) ?? 1) - 1);
      }
    }
  }

  const n = Math.max(1, Math.min(concorrencia, lista.length));
  await Promise.all(Array.from({ length: n }, () => trabalhador()));
  return saida;
}
