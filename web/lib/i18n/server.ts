import { cookies } from "next/headers";
import { LANG_COOKIE, normalizarLang, tPara, type Lang } from "./index";

/** Idioma da requisição (cookie "lang"). Só em Server Components, route handlers e server actions. */
export async function getLang(): Promise<Lang> {
  const c = await cookies();
  return normalizarLang(c.get(LANG_COOKIE)?.value);
}

/** Em Server Components: const t = await tServer(); t("Texto em português"). */
export async function tServer() { return tPara(await getLang()); }
