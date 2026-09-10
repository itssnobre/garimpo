"use client";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LANG_COOKIE, normalizarLang, tPara, type Lang, type T } from "./index";
import { setFmtLang } from "@/lib/fmt";

type Ctx = { lang: Lang; t: T; trocar: (l: Lang) => void };
const LangCtx = createContext<Ctx>({ lang: "pt", t: tPara("pt"), trocar: () => {} });

/** Envolve a árvore com o idioma vindo do cookie (lido no servidor). Trocar grava o cookie e recarrega os Server Components. */
export function LangProvider({ inicial, children }: { inicial: Lang; children: React.ReactNode }) {
  const [lang, setLang] = useState<Lang>(inicial);
  setFmtLang(lang); // síncrono, antes dos filhos renderizarem (SSR e cliente)
  const router = useRouter();
  const trocar = useCallback((l: Lang) => {
    const novo = normalizarLang(l);
    document.cookie = `${LANG_COOKIE}=${novo}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.lang = novo === "en" ? "en" : "pt-BR";
    setLang(novo);
    router.refresh();
  }, [router]);
  const valor = useMemo<Ctx>(() => ({ lang, t: tPara(lang), trocar }), [lang, trocar]);
  return <LangCtx.Provider value={valor}>{children}</LangCtx.Provider>;
}

/** Em componentes de cliente: const { t, lang } = useT(); t("Texto em português"). */
export function useT() { return useContext(LangCtx); }
