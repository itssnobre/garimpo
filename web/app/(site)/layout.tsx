import Link from "next/link";
import { META } from "@/lib/data";
import { MARCA } from "@/lib/marca";
import TopoConta from "@/components/TopoConta";
import Idioma from "@/components/Idioma";
import { tServer, getLang } from "@/lib/i18n/server";
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const t = await tServer();
  const lang = await getLang();
  const gerado = new Date(META.gerado_em).toLocaleString(lang === "en" ? "en-US" : "pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  return (
    <div className="site-shell">
        <nav className="topo">
          <Link href="/" className="marca" aria-label={t("{marca}, início", { marca: MARCA })}><img src="/marca/logo-dark.svg" alt={MARCA} className="logo-img logo-inv" /></Link>
          <div className="topo-links">
            <Link href="/app/buscar">{t("Imóveis")}</Link>
            <Link href="/#como-funciona">{t("Como funciona")}</Link>
            <Link href="/#assessoria">{t("Assessoria")}</Link>
            <Idioma />
            <TopoConta />
          </div>
        </nav>
      <div className="site-corpo">{children}</div>
        <footer className="rodape">
          <div className="rodape-in">
            <div className="rodape-marca"><img src="/marca/logo-light.svg" alt={MARCA} className="logo-img" /><p>{t("Leilão de imóveis com a conta feita antes do lance. Catálogo do Brasil inteiro, filtrado pelo seu padrão, com lance máximo, margem líquida e riscos em cada lote.")}</p></div>
            <div><b>{t("Navegar")}</b><Link href="/app/buscar">{t("Catálogo de imóveis")}</Link><Link href="/entrar?modo=criar">{t("Criar conta")}</Link><Link href="/entrar">{t("Entrar")}</Link><Link href="/#como-funciona">{t("Como funciona")}</Link><Link href="/#assessoria">{t("Planos e comissão")}</Link><Link href="/#contato">{t("Contato")}</Link></div>
            <div><b>{t("Fontes")}</b><span>{t("Caixa, Mega Leilões, Superbid, Portal Zuk, Sodré Santoro, Frazão, Biasi, Lance Judicial, Leilão Imóvel")}</span></div>
            <div><b>{t("Aviso")}</b><span>{t("A {marca} não é leiloeira nem intermedeia lances. Valores de avaliação e lance vêm das fontes e podem mudar sem aviso. Nenhuma decisão deve ser tomada sem a matrícula atualizada e o edital em mãos.", { marca: MARCA })}</span></div>
          </div>
          <div className="rodape-base"><span>© {new Date().getFullYear()} {MARCA}</span><span>{t("Base atualizada em {data}", { data: gerado })}</span><Idioma /></div>
        </footer>
    </div>
  );
}
