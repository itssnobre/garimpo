"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useTema } from "@/lib/tema";
import { MARCA } from "@/lib/marca";

const P = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const I = {
  padrao: <svg {...P}><path d="M4 6h16M4 12h10M4 18h6" /><circle cx="18" cy="12" r="2" /><circle cx="14" cy="18" r="2" /></svg>,
  buscar: <svg {...P}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>,
  sugeridos: <svg {...P}><path d="M12 3l1.8 4.6L18.5 9l-4.7 1.4L12 15l-1.8-4.6L5.5 9l4.7-1.4z" /><path d="M19 16l.7 1.8 1.8.7-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z" /></svg>,
  sage: <svg {...P}><path d="M4 12a8 8 0 1 1 4.2 7L4 20l1-4.2A8 8 0 0 1 4 12z" /><path d="M9 11h6M9 14h4" /></svg>,
  pipeline: <svg {...P}><path d="M5 4v16M12 4v10M19 4v13" /><circle cx="5" cy="20" r="1" fill="currentColor" /><circle cx="12" cy="14" r="1" fill="currentColor" /><circle cx="19" cy="17" r="1" fill="currentColor" /></svg>,
  carteira: <svg {...P}><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18" /></svg>,
  calculadora: <svg {...P}><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M8 7h8M8 12h2M12 12h2M16 12h0M8 16h2M12 16h2M16 16h0" /></svg>,
  favoritos: <svg {...P}><path d="M12 3l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.3 6.3 20.5l1.2-6.4L2.8 9.7l6.4-.8z" /></svg>,
  juridico: <svg {...P}><path d="M12 3v18M5 7h14M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0zM8 21h8" /></svg>,
  cobertura: <svg {...P}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" /></svg>,
  config: <svg {...P}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>,
};
const GRUPOS: { titulo?: string; itens: { href: string; label: string; icone: keyof typeof I; ia?: boolean }[] }[] = [
  { itens: [{ href: "/app/buscar", label: "Buscar", icone: "buscar" }, { href: "/app/sugeridos", label: "Sugeridos", icone: "sugeridos" }, { href: "/app/sage", label: "Sage", icone: "sage", ia: true }, { href: "/app/pipeline", label: "Pipeline", icone: "pipeline" }, { href: "/app/carteira", label: "Carteira", icone: "carteira" }] },
  { itens: [{ href: "/app/padrao", label: "Meu padrão", icone: "padrao" }, { href: "/app/calculadora", label: "Calculadora", icone: "calculadora" }, { href: "/app/favoritos", label: "Favoritos", icone: "favoritos" }, { href: "/app/juridico", label: "Jurídico", icone: "juridico" }, { href: "/app/cobertura", label: "Cobertura", icone: "cobertura" }, { href: "/app/configuracoes", label: "Configurações", icone: "config" }] },
];

export default function Sidebar() {
  const path = usePathname(); const { tema, aplicar } = useTema(); const [aberto, setAberto] = useState(false);
  useEffect(() => { setAberto(false); }, [path]);
  useEffect(() => { document.body.classList.toggle("travado", aberto); return () => document.body.classList.remove("travado"); }, [aberto]);
  return (
    <>
      <header className="app-topo-mobile">
        <Link href="/app/buscar" aria-label={MARCA}><img className="logo-inv" src="/marca/logo-dark.svg" alt={MARCA} /></Link>
        <Link href="/#contato" className="btn ouro mini">Assessoria</Link>
      </header>
      <nav className="tabbar" aria-label="Navegação principal">
        {GRUPOS[0].itens.slice(0, 4).map((it) => { const on = path.startsWith(it.href); return <Link key={it.href} href={it.href} className={`tab ${on ? "on" : ""}`}>{I[it.icone]}<span>{it.label}</span></Link>; })}
        <button className={`tab ${aberto ? "on" : ""}`} onClick={() => setAberto(true)} aria-expanded={aberto}><svg {...P}><circle cx="5" cy="12" r="1.6" fill="currentColor" /><circle cx="12" cy="12" r="1.6" fill="currentColor" /><circle cx="19" cy="12" r="1.6" fill="currentColor" /></svg><span>Mais</span></button>
      </nav>
      {aberto && <><div className="folha-fundo" onClick={() => setAberto(false)} /><div className="folha" role="dialog" aria-label="Mais opções">
        <h3>Mais</h3>{[...GRUPOS[0].itens.slice(4), ...GRUPOS[1].itens].map((it) => { const on = path.startsWith(it.href); return <Link key={it.href} href={it.href} className={`sb-item ${on ? "on" : ""}`}><span className="sb-ico">{I[it.icone]}</span><span>{it.label}</span></Link>; })}
        <h3>Tema</h3><div className="tema">{(["light", "dark", "system"] as const).map((t) => <button key={t} aria-pressed={tema === t} onClick={() => aplicar(t)} style={{ fontSize: 12.5, fontWeight: 500 }}>{t === "light" ? "Claro" : t === "dark" ? "Escuro" : "Sistema"}</button>)}</div>
      </div></>}
      <aside className="sidebar">
        <Link href="/" className="sb-logo" aria-label={`${MARCA}, site`}><img className="logo-inv" src="/marca/logo-dark.svg" alt={MARCA} /></Link>
        <nav className="sb-nav">
          {GRUPOS.map((g, k) => <div key={k} className="sb-grupo">{g.itens.map((it) => { const on = path.startsWith(it.href); return (
            <Link key={it.href} href={it.href} className={`sb-item ${on ? "on" : ""} ${it.ia ? "ia" : ""}`} aria-current={on ? "page" : undefined}><span className="sb-ico">{I[it.icone]}</span><span>{it.label}</span>{it.ia && <span className="sb-tag">IA</span>}</Link>); })}</div>)}
        </nav>
        <div className="sb-pe">
          <div className="tema" role="group" aria-label="Tema">
            {(["light", "dark", "system"] as const).map((t) => <button key={t} aria-pressed={tema === t} onClick={() => aplicar(t)} title={t === "light" ? "Claro" : t === "dark" ? "Escuro" : "Sistema"}>
              {t === "light" ? <svg {...P}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg> : t === "dark" ? <svg {...P}><path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z" /></svg> : <svg {...P}><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></svg>}
            </button>)}
          </div>
          <Link href="/#contato" className="btn ouro sb-cta">Falar com a equipe</Link>
          <p className="sb-nota">Seus favoritos e pipeline ficam neste navegador.</p>
        </div>
      </aside>
    </>
  );
}
