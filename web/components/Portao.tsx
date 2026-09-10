"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useConta } from "@/lib/conta";
import { useT } from "@/lib/i18n/client";

/** Portão das áreas que exigem conta. Sem Supabase configurado, deixa passar (ambiente local sem nuvem). */
export default function Portao({ children, titulo, admin }: { children: React.ReactNode; titulo?: string; admin?: boolean }) {
  const { t } = useT();
  const { user, pronto, nuvem, perfil } = useConta(); const path = usePathname();
  if (!nuvem) return <>{children}</>;
  if (!pronto) return null;
  if (!user) return (<>
    {titulo && <div className="app-cab"><div><h1>{titulo}</h1></div></div>}
    <div className="vazio portao">
      <b>{t("Precisa de conta para usar {area}", { area: titulo ?? t("esta área") })}</b>
      {t("Conta grátis: seu padrão, favoritos, pipeline, carteira e o Sage ficam salvos e seguem você em qualquer aparelho.")}
      <p style={{ margin: "16px 0 0", display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
        <Link href={`/entrar?modo=criar&next=${encodeURIComponent(path)}`} className="btn ouro">{t("Criar conta grátis")}</Link>
        <Link href={`/entrar?next=${encodeURIComponent(path)}`} className="btn sec">{t("Já tenho conta")}</Link>
      </p>
    </div>
  </>);
  if (admin && perfil?.papel !== "admin") return (<>
    {titulo && <div className="app-cab"><div><h1>{titulo}</h1></div></div>}
    <div className="vazio"><b>{t("Área restrita")}</b>{t("Só administradores da plataforma entram aqui.")}</div>
  </>);
  return <>{children}</>;
}
