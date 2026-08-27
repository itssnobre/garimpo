import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  async redirects() { return [{ source: "/imoveis", destination: "/app/buscar", permanent: true }, { source: "/imovel/:id", destination: "/app/imovel/:id", permanent: true }]; },
};
export default nextConfig;
