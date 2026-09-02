import type { Metadata } from "next";
import { Source_Serif_4, Public_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { MARCA, TAGLINE } from "@/lib/marca";

const display = Source_Serif_4({ subsets: ["latin"], variable: "--f-display", weight: ["600", "700"] });
const body = Public_Sans({ subsets: ["latin"], variable: "--f-body", weight: ["400", "500", "600", "700"] });
const mono = IBM_Plex_Mono({ subsets: ["latin"], variable: "--f-mono", weight: ["400", "500"] });

export const metadata: Metadata = {
  title: { default: `${MARCA} · ${TAGLINE}`, template: `%s · ${MARCA}` },
  description: "Imóveis em leilão do Brasil inteiro, recalculados com leiloeiro, ITBI, registro e carrego. Só o que paga a margem, com lance máximo e análise de matrícula.",
  openGraph: { title: `${MARCA} · ${TAGLINE}`, description: "Imóveis em leilão em todo o Brasil com margem líquida real, régua de lance e assessoria de arremate.", type: "website", locale: "pt_BR" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        {children}
      </body>
    </html>
  );
}
