// Checagem de origem nas rotas que escrevem (POST/PATCH/DELETE): se o navegador
// mandou o cabeçalho Origin e ele aponta para outro host, a chamada veio de fora
// (CSRF). Sem cabeçalho Origin (server-to-server, curl) a chamada segue.

/** true quando não há Origin ou quando o Origin é o mesmo host da requisição. */
export function origemOk(request: Request): boolean {
  const origem = request.headers.get("origin");
  if (!origem) return true;
  let host: string;
  try {
    host = new URL(origem).host;
  } catch {
    return false;
  }
  const alvo =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    (() => {
      try {
        return new URL(request.url).host;
      } catch {
        return "";
      }
    })();
  return Boolean(alvo) && host === alvo;
}
