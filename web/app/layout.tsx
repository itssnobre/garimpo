import type { Metadata } from "next";
import { Bricolage_Grotesque, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { META } from "@/lib/data";
import { MARCA, TAGLINE } from "@/lib/marca";

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--f-display", weight: ["500", "700", "800"] });
const body = IBM_Plex_Sans({ subsets: ["latin"], variable: "--f-body", weight: ["400", "500", "600"] });
const mono = IBM_Plex_Mono({ subsets: ["latin"], variable: "--f-mono", weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  title: { default: `${MARCA} · ${TAGLINE}`, template: `%s · ${MARCA}` },
  description: "Todos os imóveis em leilão de São Paulo, recalculados com leiloeiro, ITBI, registro e carrego. Só o que paga a margem, com lance máximo e análise de matrícula.",
  openGraph: { title: `${MARCA} · ${TAGLINE}`, description: "Imóveis em leilão em SP com margem líquida real, régua de lance e assessoria de arremate.", type: "website", locale: "pt_BR" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const gerado = new Date(META.gerado_em).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  return (
    <html lang="pt-BR" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        <nav className="topo">
          <Link href="/" className="marca" aria-label={`${MARCA}, início`}><span className="marca-selo">L</span><span>{MARCA.toUpperCase()}</span></Link>
          <div className="topo-links">
            <Link href="/imoveis">Imóveis</Link>
            <Link href="/#como-funciona">Como funciona</Link>
            <Link href="/#assessoria">Assessoria</Link>
            <Link href="/#contato" className="btn ouro topo-cta">Falar com a equipe</Link>
          </div>
        </nav>
        {children}
        <footer className="rodape">
          <div className="rodape-in">
            <div><div className="marca" style={{ marginBottom: 8 }}><span className="marca-selo">L</span><span>{MARCA.toUpperCase()}</span></div><p className="mono" style={{ fontSize: 11.5 }}>{META.total.toLocaleString("pt-BR")} lotes · {Object.keys(META.fontes).length} fontes · coleta {gerado}</p></div>
            <div><b>Navegar</b><Link href="/imoveis">Catálogo de imóveis</Link><Link href="/#como-funciona">Como funciona</Link><Link href="/#assessoria">Planos e comissão</Link><Link href="/#contato">Contato</Link></div>
            <div><b>Fontes</b><span>Caixa, Mega Leilões, Superbid, Portal Zuk, Sodré Santoro, Frazão, Biasi, Lance Judicial, Leilão Imóvel</span></div>
            <div><b>Aviso</b><span>A {MARCA} não é leiloeira nem intermedeia lances. Valores de avaliação e lance vêm das fontes e podem mudar sem aviso. Nenhuma decisão deve ser tomada sem a matrícula atualizada e o edital em mãos.</span></div>
          </div>
        </footer>
      </body>
    </html>
  );
}
