"use client";
import { useEffect } from "react";
export default function Reveal() {
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>(".land-sec, .passo, .dif, .plano");
    els.forEach((e) => e.classList.add("reveal"));
    const io = new IntersectionObserver((es) => es.forEach((x) => { if (x.isIntersecting) { (x.target as HTMLElement).classList.add("vis"); io.unobserve(x.target); } }), { rootMargin: "0px 0px -8% 0px" });
    els.forEach((e) => io.observe(e)); return () => io.disconnect();
  }, []);
  return null;
}
