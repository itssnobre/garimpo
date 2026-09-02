import Link from "next/link";
import { META } from "@/lib/data";
import { MARCA } from "@/lib/marca";
import TopoConta from "@/components/TopoConta";
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  const gerado = new Date(META.gerado_em).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  return (
    <div className="site-shell">
        <nav className="topo">
          <Link href="/" className="marca" aria-label={`${MARCA}, início`}><img src="/marca/logo-dark.svg" alt={MARCA} className="logo-img logo-inv" /></Link>
          <div className="topo-links">
            <Link href="/app/buscar">Imóveis</Link>
            <Link href="/#como-funciona">Como funciona</Link>
            <Link href="/#assessoria">Assessoria</Link>
            <TopoConta />
          </div>
        </nav>
      <div className="site-corpo">{children}</div>
        <footer className="rodape">
          <div className="rodape-in">
            <div className="rodape-marca"><img src="/marca/logo-light.svg" alt={MARCA} className="logo-img" /><p>Leilão de imóveis com a conta feita antes do lance. Catálogo do Brasil inteiro, filtrado pelo seu padrão, com lance máximo, margem líquida e riscos em cada lote.</p></div>
            <div><b>Navegar</b><Link href="/app/buscar">Catálogo de imóveis</Link><Link href="/entrar?modo=criar">Criar conta</Link><Link href="/entrar">Entrar</Link><Link href="/#como-funciona">Como funciona</Link><Link href="/#assessoria">Planos e comissão</Link><Link href="/#contato">Contato</Link></div>
            <div><b>Fontes</b><span>Caixa, Mega Leilões, Superbid, Portal Zuk, Sodré Santoro, Frazão, Biasi, Lance Judicial, Leilão Imóvel</span></div>
            <div><b>Aviso</b><span>A {MARCA} não é leiloeira nem intermedeia lances. Valores de avaliação e lance vêm das fontes e podem mudar sem aviso. Nenhuma decisão deve ser tomada sem a matrícula atualizada e o edital em mãos.</span></div>
          </div>
          <div className="rodape-base"><span>© {new Date().getFullYear()} {MARCA}</span><span>Base atualizada em {gerado}</span></div>
        </footer>
    </div>
  );
}
