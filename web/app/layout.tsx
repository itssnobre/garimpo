import type { Metadata } from "next";
import { Fraunces, Instrument_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { MARCA, TAGLINE } from "@/lib/marca";

const display = Fraunces({ subsets: ["latin"], variable: "--f-display", weight: "variable", axes: ["opsz"] });
const body = Instrument_Sans({ subsets: ["latin"], variable: "--f-body", weight: ["400", "500", "600"] });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--f-mono", weight: ["400", "500"] });

export const metadata: Metadata = {
  title: { default: `${MARCA} · ${TAGLINE}`, template: `%s · ${MARCA}` },
  description: "Todos os imóveis em leilão de São Paulo, recalculados com leiloeiro, ITBI, registro e carrego. Só o que paga a margem, com lance máximo e análise de matrícula.",
  openGraph: { title: `${MARCA} · ${TAGLINE}`, description: "Imóveis em leilão em SP com margem líquida real, régua de lance e assessoria de arremate.", type: "website", locale: "pt_BR" },
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
