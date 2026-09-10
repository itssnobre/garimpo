// Destino seguro para o parâmetro "next" (login, callback de e-mail, botões de visitante).
// Sem isso, um link com ?next=https://site-falso ou ?next=javascript:... vira redirecionamento
// aberto (open redirect) ou execução de script no navegador do usuário.

/** Devolve o próprio caminho quando ele é interno; qualquer outra coisa vira o padrão. */
export function destinoSeguro(next: string | null | undefined, padrao = "/app/buscar"): string {
  if (typeof next !== "string") return padrao;
  if (next.includes("\n") || next.includes("\r")) return padrao;
  const v = next.trim();
  if (!v.startsWith("/")) return padrao;            // absoluto, relativo ou esquema (javascript:, https:)
  if (v.startsWith("//") || v.startsWith("/\\")) return padrao; // "//evil.com" e "/\evil.com" viram host externo
  const corte = v.indexOf("?");
  const caminho = corte === -1 ? v : v.slice(0, corte);
  if (caminho.includes(":")) return padrao;          // "/a:b" é lido como esquema por alguns navegadores
  return v;
}
