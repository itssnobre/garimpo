import type { Metadata } from "next";
import { Source_Serif_4, Public_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { MARCA, TAGLINE } from "@/lib/marca";
import { LangProvider } from "@/lib/i18n/client";
import { getLang } from "@/lib/i18n/server";
import { traduzir } from "@/lib/i18n";

const display = Source_Serif_4({ subsets: ["latin"], variable: "--f-display", weight: ["600", "700"] });
const body = Public_Sans({ subsets: ["latin"], variable: "--f-body", weight: ["400", "500", "600", "700"] });
const mono = IBM_Plex_Mono({ subsets: ["latin"], variable: "--f-mono", weight: ["400", "500"] });

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang(); const t = (s: string) => traduzir(lang, s);
  return {
    title: { default: `${MARCA} · ${t(TAGLINE)}`, template: `%s · ${MARCA}` },
    description: t("Imóveis em leilão do Brasil inteiro, recalculados com leiloeiro, ITBI, registro e carrego. Só o que paga a margem, com lance máximo e análise de matrícula."),
    openGraph: { title: `${MARCA} · ${t(TAGLINE)}`, description: t("Imóveis em leilão em todo o Brasil com margem líquida real, régua de lance e assessoria de arremate."), type: "website", locale: lang === "en" ? "en_US" : "pt_BR" },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLang();
  return (
    <html lang={lang === "en" ? "en" : "pt-BR"} className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        <LangProvider inicial={lang}>{children}</LangProvider>
      </body>
    </html>
  );
}
