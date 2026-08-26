# Garimpo

Filtro de imóveis em leilão (SP) no padrão combinado: faixa de avaliação, deságio mínimo 40%, margem líquida mínima 25% (alvo 30 a 35%) depois de todos os custos, região Sorocaba/ABC e vetos de diligência (direitos de fiduciante, fração ideal).

- `collectors/` coletores Python, um por fonte, todos no schema de `docs/SCHEMA.md`. `python3 collectors/build.py --collect` roda tudo e gera `data/imoveis.json`.
- `web/` app Next.js (lista + página do imóvel com Parte 1 Riscos, Parte 2 Valores, lance máximo por margem, checklist e análise de matrícula por IA via `ANTHROPIC_API_KEY`).
- `.github/workflows/coleta.yml` recoleta todo dia 06:00 e comita; Vercel redeploya.

Dev: `cd web && npm i && npm run dev`.
