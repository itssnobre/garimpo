"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useConta } from "@/lib/conta";

/** Portão das áreas que exigem conta. Sem Supabase configurado, deixa passar (ambiente local sem nuvem). */
export default function Portao({ children, titulo, admin }: { children: React.ReactNode; titulo?: string; admin?: boolean }) {
  const { user, pronto, nuvem, perfil } = useConta(); const path = usePathname();
  if (!nuvem) return <>{children}</>;
  if (!pronto) return null;
  if (!user) return (<>
    {titulo && <div className="app-cab"><div><h1>{titulo}</h1></div></div>}
    <div className="vazio portao">
      <b>Precisa de conta para usar {titulo ?? "esta área"}</b>
      Conta grátis: seu padrão, favoritos, pipeline, carteira e o Sage ficam salvos e seguem você em qualquer aparelho.
      <p style={{ margin: "16px 0 0", display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
        <Link href={`/entrar?modo=criar&next=${encodeURIComponent(path)}`} className="btn ouro">Criar conta grátis</Link>
        <Link href={`/entrar?next=${encodeURIComponent(path)}`} className="btn sec">Já tenho conta</Link>
      </p>
    </div>
  </>);
  if (admin && perfil?.papel !== "admin") return (<>
    {titulo && <div className="app-cab"><div><h1>{titulo}</h1></div></div>}
    <div className="vazio"><b>Área restrita</b>Só administradores da plataforma entram aqui.</div>
  </>);
  return <>{children}</>;
}
