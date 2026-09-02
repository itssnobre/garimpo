#!/usr/bin/env bash
# Aplica UMA migration da Lotwise no projeto Supabase compartilhado (Project Nobre) via Management API.
# Uso: bash supabase/aplicar.sh supabase/migrations/20260902000000_perfis_admin.sql
set -euo pipefail
cd "$(dirname "$0")/.."
ARQ="${1:?informe o .sql}"
TOKEN=$(grep '^SUPABASE_ACCESS_TOKEN=' ~/Projetos/trevocode-gestao/.env.local | cut -d= -f2)
REF="kidvktaqnqfsdalivpbu"
PAYLOAD=$(python3 -c 'import json,sys; print(json.dumps({"query": open(sys.argv[1]).read()}))' "$ARQ")
curl -sS -X POST "https://api.supabase.com/v1/projects/${REF}/database/query" \
  -H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json" -d "$PAYLOAD"
echo; echo "✓ aplicado: $ARQ"
