import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Garimpo | Leilão de Imóveis", description: "Filtro de imóveis em leilão no padrão de margem e risco combinado." };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="pt-BR"><body>{children}</body></html>);
}
