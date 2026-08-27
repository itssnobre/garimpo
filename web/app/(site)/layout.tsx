import Link from "next/link";
import { META } from "@/lib/data";
import { MARCA } from "@/lib/marca";
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  const gerado = new Date(META.gerado_em).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  return (
    <>
        <nav className="topo">
          <Link href="/" className="marca" aria-label={`${MARCA}, início`}><img src="/marca/logo-dark.svg" alt={MARCA} className="logo-img" /></Link>
          <div className="topo-links">
            <Link href="/app/buscar">Imóveis</Link>
            <Link href="/#como-funciona">Como funciona</Link>
            <Link href="/#assessoria">Assessoria</Link>
            <Link href="/app/buscar" className="btn ouro topo-cta">Abrir a plataforma</Link>
          </div>
        </nav>
      {children}
        <footer className="rodape">
          <div className="rodape-in">
            <div><img src="/marca/logo-light.svg" alt={MARCA} className="logo-img" style={{ marginBottom: 10 }} /><p style={{ fontSize: 12, fontFamily: "var(--f-mono)" }}>{META.total.toLocaleString("pt-BR")} lotes · {Object.keys(META.fontes).length} fontes · coleta {gerado}</p></div>
            <div><b>Navegar</b><Link href="/app/buscar">Catálogo de imóveis</Link><Link href="/app/sage">Sage, a IA</Link><Link href="/#como-funciona">Como funciona</Link><Link href="/#assessoria">Planos e comissão</Link><Link href="/#contato">Contato</Link></div>
            <div><b>Fontes</b><span>Caixa, Mega Leilões, Superbid, Portal Zuk, Sodré Santoro, Frazão, Biasi, Lance Judicial, Leilão Imóvel</span></div>
            <div><b>Aviso</b><span>A {MARCA} não é leiloeira nem intermedeia lances. Valores de avaliação e lance vêm das fontes e podem mudar sem aviso. Nenhuma decisão deve ser tomada sem a matrícula atualizada e o edital em mãos.</span></div>
          </div>
        </footer>
    </>
  );
}
