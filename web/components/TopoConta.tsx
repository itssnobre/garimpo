"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { nuvemConfigurada, supabaseBrowser } from "@/lib/supabase/client";

/** Botões de conta no topo do site: visitante vê Entrar + Criar conta; logado vê Abrir a plataforma. Sem nuvem, só o botão da plataforma. */
export default function TopoConta() {
  const [estado, setEstado] = useState<"checando" | "visitante" | "logado">(nuvemConfigurada() ? "checando" : "logado");
  useEffect(() => {
    const sb = supabaseBrowser(); if (!sb) return;
    sb.auth.getUser().then(({ data }) => setEstado(data.user ? "logado" : "visitante"));
  }, []);
  if (estado === "logado") return <Link href="/app/buscar" className="btn ouro topo-cta">Abrir a plataforma</Link>;
  return (
    <span className="topo-conta" style={{ visibility: estado === "checando" ? "hidden" : "visible" }}>
      <Link href="/entrar" className="btn sec topo-cta">Entrar</Link>
      <Link href="/entrar?modo=criar" className="btn ouro topo-cta">Criar conta</Link>
    </span>
  );
}
