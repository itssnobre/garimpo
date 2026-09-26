#!/usr/bin/env bash
# Liga o login com Google no projeto Supabase da Lotwise e libera os callbacks (localhost:3077 e produção).
# Uso (rode você mesmo, para o segredo não passar pelo assistente):
#   GOOGLE_CLIENT_ID="...apps.googleusercontent.com" GOOGLE_CLIENT_SECRET="GOCSPX-..." bash supabase/ativar-google.sh
set -euo pipefail
REF=kidvktaqnqfsdalivpbu
TOKEN=$(grep -o '^SUPABASE_ACCESS_TOKEN=.*' ~/Projetos/trevocode-gestao/.env.local | cut -d= -f2- | tr -d '"')
: "${GOOGLE_CLIENT_ID:?defina GOOGLE_CLIENT_ID}" "${GOOGLE_CLIENT_SECRET:?defina GOOGLE_CLIENT_SECRET}"
ATUAL=$(curl -s "https://api.supabase.com/v1/projects/$REF/config/auth" -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json; print(json.load(sys.stdin).get('uri_allow_list') or '')")
NOVOS="http://localhost:3077/auth/callback,https://garimpo-swart.vercel.app/**"
ALLOW="$ATUAL"; for u in ${NOVOS//,/ }; do [[ ",$ALLOW," == *",$u,"* ]] || ALLOW="$ALLOW,$u"; done
# O JSON leva o client secret: arquivo privado (600) e apagado na saída, mesmo se algo falhar.
PATCH_JSON=$(mktemp "${TMPDIR:-/tmp}/lotwise-auth-patch.XXXXXX")
trap 'rm -f "$PATCH_JSON"' EXIT INT TERM
chmod 600 "$PATCH_JSON"
python3 - "$ALLOW" <<'PY' > "$PATCH_JSON"
import json,os,sys
print(json.dumps({"external_google_enabled": True, "external_google_client_id": os.environ["GOOGLE_CLIENT_ID"], "external_google_secret": os.environ["GOOGLE_CLIENT_SECRET"], "uri_allow_list": sys.argv[1].strip(",")}))
PY
curl -s -X PATCH "https://api.supabase.com/v1/projects/$REF/config/auth" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d @"$PATCH_JSON" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('google ligado:', d.get('external_google_enabled'), '| client:', (d.get('external_google_client_id') or '')[:20]+'...'); print('callbacks:', d.get('uri_allow_list'))"
echo "pronto: teste em http://localhost:3077/entrar"
