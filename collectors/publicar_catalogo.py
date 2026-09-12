"""Publica web/data/imoveis.json na tabela lotwise_catalogo do Supabase.

Uso: .venv/bin/python collectors/publicar_catalogo.py [--seco]

Lê as credenciais de web/.env.local (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).
Manda em lotes com upsert, e no fim apaga o que não veio nesta carga, que são os lotes que
saíram das fontes. A remoção tem trava: se fosse apagar mais de um terço da tabela, para e
avisa, porque isso é sinal de coleta quebrada e não de catálogo menor.
"""
import json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import requests
from common import ROOT, strip_accents

TABELA = "lotwise_catalogo"
LOTE = 500
# Campos que viram coluna; o resto do lote vai para `detalhe`.
COLUNAS = {
    "id", "fonte", "url", "tipo", "titulo", "endereco", "bairro", "cidade", "uf", "cep",
    "area_privativa_m2", "area_terreno_m2", "quartos", "vagas", "avaliacao", "lance_minimo",
    "desagio_pct", "modalidade", "praca", "data_leilao", "data_fim", "ocupado",
    "aceita_financiamento", "aceita_fgts", "debitos_por_conta_comprador", "direitos_fiduciante",
    "fracao_ideal", "dominio_util", "massa_falida", "direitos_aquisitivos", "onus_averbado",
    "debitos_teto10", "valor_suspeito", "avaliacao_outra_fonte", "matricula", "leiloeiro",
    "foto", "coletado_em",
}


def credenciais():
    """Na máquina, lê web/.env.local; no GitHub Actions, as variáveis de ambiente."""
    env = {}
    caminho = os.path.join(ROOT, "web", ".env.local")
    if os.path.exists(caminho):
        for linha in open(caminho, encoding="utf-8"):
            if "=" in linha and not linha.strip().startswith("#"):
                k, v = linha.split("=", 1)
                env[k.strip()] = v.strip().strip('"')
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or env.get("NEXT_PUBLIC_SUPABASE_URL")
    chave = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or env.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not chave:
        sys.exit("faltam NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY (ambiente ou web/.env.local)")
    return url.rstrip("/"), chave


def linha(it):
    fora = {k: v for k, v in it.items() if k not in COLUNAS and v not in (None, [], "")}
    texto = " ".join(str(x) for x in (it.get("cidade"), it.get("bairro"), it.get("endereco"),
                                      it.get("titulo"), it.get("matricula")) if x)
    # Todas as chaves em toda linha: o PostgREST recusa um lote onde os objetos diferem entre si.
    r = {k: it.get(k) for k in COLUNAS}
    r["id"] = it["id"]
    r["busca"] = strip_accents(texto.lower())[:600]
    r["detalhe"] = fora
    # Datas vazias quebram o insert: o Postgres quer null, não "".
    for k in ("data_leilao", "data_fim"):
        if not r.get(k):
            r[k] = None
    return r


def main(seco=False):
    url, chave = credenciais()
    cab = {"apikey": chave, "Authorization": f"Bearer {chave}", "Content-Type": "application/json"}
    dados = json.load(open(os.path.join(ROOT, "web", "data", "imoveis.json"), encoding="utf-8"))
    # Defesa: id repetido no mesmo lote faz o Postgres recusar o upsert inteiro.
    unicos = {it["id"]: it for it in dados}
    linhas = [linha(it) for it in unicos.values()]
    print(f"[catálogo] {len(linhas)} lotes para publicar")

    antes = requests.get(f"{url}/rest/v1/{TABELA}?select=id", headers={**cab, "Prefer": "count=exact", "Range": "0-0"})
    total_antes = int(antes.headers.get("content-range", "*/0").split("/")[-1] or 0)
    print(f"[catálogo] na tabela agora: {total_antes}")
    if seco:
        print("[catálogo] modo seco, nada foi enviado"); return

    marca = time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(time.time() - 60)) + "+00:00"
    enviados = 0
    for i in range(0, len(linhas), LOTE):
        parte = linhas[i:i + LOTE]
        r = requests.post(f"{url}/rest/v1/{TABELA}?on_conflict=id", headers={**cab, "Prefer": "resolution=merge-duplicates,return=minimal"},
                          data=json.dumps(parte, ensure_ascii=False).encode("utf-8"), timeout=180)
        if r.status_code >= 300:
            sys.exit(f"[catálogo] falhou no lote {i}: HTTP {r.status_code} {r.text[:400]}")
        enviados += len(parte)
        if (i // LOTE) % 10 == 0 or enviados == len(linhas):
            print(f"[catálogo] {enviados}/{len(linhas)}")

    r = requests.get(f"{url}/rest/v1/{TABELA}?select=id&atualizado_em=lt.{marca}", headers={**cab, "Prefer": "count=exact", "Range": "0-0"})
    sobrando = int(r.headers.get("content-range", "*/0").split("/")[-1] or 0)
    if sobrando == 0:
        print("[catálogo] nada para remover"); return
    if total_antes and sobrando > total_antes / 3:
        print(f"[catálogo] ATENÇÃO: {sobrando} lotes ficaram de fora desta carga (mais de um terço). "
              "Não removi nada: confira a coleta antes."); return
    d = requests.delete(f"{url}/rest/v1/{TABELA}?atualizado_em=lt.{marca}", headers={**cab, "Prefer": "return=minimal"}, timeout=180)
    if d.status_code >= 300:
        sys.exit(f"[catálogo] falha ao remover: HTTP {d.status_code} {d.text[:300]}")
    print(f"[catálogo] removidos {sobrando} lotes que saíram das fontes")


if __name__ == "__main__":
    main(seco="--seco" in sys.argv)
