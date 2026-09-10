import type { NextConfig } from "next";

// CSP em modo relatório: o navegador só registra a violação no console, não bloqueia nada.
// Serve para medir o estrago antes de ligar a política de verdade (Content-Security-Policy).
// 'unsafe-inline' e 'unsafe-eval' em script-src existem porque o Next injeta o bootstrap inline
// e o Turbopack usa eval em desenvolvimento; tirar os dois é o passo seguinte, com nonce.
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https://*.supabase.co",
  "media-src 'self' https:",
  "form-action 'self'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
].join("; ");

const SEGURANCA = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Content-Security-Policy-Report-Only", value: CSP },
];

const nextConfig: NextConfig = {
  async headers() { return [{ source: "/(.*)", headers: SEGURANCA }]; },
  async redirects() { return [{ source: "/imoveis", destination: "/app/buscar", permanent: true }, { source: "/imovel/:id", destination: "/app/imovel/:id", permanent: true }]; },
};
export default nextConfig;
