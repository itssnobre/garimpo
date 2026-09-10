"use client";
import { useT } from "@/lib/i18n/client";
import { LANGS, type Lang } from "@/lib/i18n";

const NOME: Record<Lang, string> = { pt: "PT", en: "EN" };
const TITULO: Record<Lang, string> = { pt: "Português", en: "Inglês" };

/** Seletor PT | EN. `compacto` = só as siglas, para topo do site e rodapé da sidebar. */
export default function Idioma({ compacto = true, className = "" }: { compacto?: boolean; className?: string }) {
  const { lang, t, trocar } = useT();
  return (
    <div className={`idioma ${compacto ? "" : "largo"} ${className}`} role="group" aria-label={t("Idioma")}>
      {LANGS.map((l) => (
        <button key={l} type="button" aria-pressed={lang === l} title={t(TITULO[l])} onClick={() => lang !== l && trocar(l)} lang={l === "en" ? "en" : "pt-BR"}>
          {compacto ? NOME[l] : t(TITULO[l])}
        </button>
      ))}
    </div>
  );
}
