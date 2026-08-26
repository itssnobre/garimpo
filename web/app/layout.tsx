import type { Metadata } from "next";
import { Bricolage_Grotesque, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { META } from "@/lib/data";

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--f-display", weight: ["500", "700", "800"] });
const body = IBM_Plex_Sans({ subsets: ["latin"], variable: "--f-body", weight: ["400", "500", "600"] });
const mono = IBM_Plex_Mono({ subsets: ["latin"], variable: "--f-mono", weight: ["400", "500", "600"] });

export const metadata: Metadata = { title: "Garimpo", description: "Imóveis em leilão em SP, filtrados por margem líquida e risco." };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const gerado = new Date(META.gerado_em).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  return (
    <html lang="pt-BR" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        <nav className="topo">
          <Link href="/" className="marca" aria-label="Garimpo, início"><span className="marca-selo">G</span><span>GARIMPO</span></Link>
          <span className="topo-meta mono">{META.total.toLocaleString("pt-BR")} lotes · {Object.keys(META.fontes).length} fontes · coleta {gerado}</span>
        </nav>
        {children}
        <footer className="rodape mono">Uso interno. Avaliações e lances vêm das fontes; a decisão final é sempre com matrícula e edital em mãos.</footer>
      </body>
    </html>
  );
}
