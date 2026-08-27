"use client";
import { useEffect, useState } from "react";
export type Tema = "light" | "dark" | "system";
export function useTema() {
  const [tema, setTema] = useState<Tema>("system");
  useEffect(() => { try { const t = localStorage.getItem("garimpo:tema") as Tema | null; if (t) aplicar(t); } catch {} }, []);
  function aplicar(t: Tema) {
    setTema(t); try { localStorage.setItem("garimpo:tema", t); } catch {}
    const h = document.documentElement; if (t === "system") h.removeAttribute("data-theme"); else h.setAttribute("data-theme", t);
  }
  return { tema, aplicar };
}
