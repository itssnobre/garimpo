"""Junta data/raw/*.json, deduplica e grava data/imoveis.json + data/meta.json.

Uso: python3 collectors/build.py            (só junta o que já existe em data/raw)
     python3 collectors/build.py --collect  (roda todos os coletores antes)
"""
import glob, importlib, json, os, sys, traceback, datetime as dt
from common import ROOT, RAW, now_iso, strip_accents, flags

FONTES = ["caixa", "zuk", "megaleiloes", "superbid", "sodresantoro", "leilaoimovel", "frazao", "biasi", "lancejudicial",
          "santanderimoveis", "bradesco", "emgea", "itau"]
OBRIG = ["id", "fonte", "url", "tipo", "titulo", "cidade", "uf", "avaliacao", "lance_minimo", "desagio_pct", "modalidade",
         "direitos_fiduciante", "fracao_ideal", "coletado_em"]

def run_collectors():
    sys.path.insert(0, os.path.dirname(__file__))
    for f in FONTES:
        if not os.path.exists(os.path.join(os.path.dirname(__file__), f + ".py")): continue
        try:
            mod = importlib.import_module(f)
            items = mod.collect()
            from common import save_raw
            save_raw(f, items)
        except Exception:
            print(f"[{f}] FALHOU"); traceback.print_exc()

def key(it):
    """Chave de dedup entre fontes: endereço+cidade normalizados, ou matrícula."""
    if it.get("matricula") and it.get("cartorio"):
        return "m:" + strip_accents(f"{it['matricula']}|{it['cartorio']}".lower())
    end = strip_accents((it.get("endereco") or "").lower())
    end = "".join(ch for ch in end if ch.isalnum())
    if len(end) < 8: return "id:" + it["id"]
    return "e:" + end + "|" + strip_accents((it.get("cidade") or "").lower())

def valid(it):
    faltam = [k for k in OBRIG if it.get(k) is None]
    if faltam: return False
    return it["avaliacao"] > 0 and it["lance_minimo"] > 0 and it["uf"] == "SP"

def main():
    if "--collect" in sys.argv: run_collectors()
    seen, out, stats = {}, [], {}
    for path in sorted(glob.glob(os.path.join(RAW, "*.json"))):
        fonte = os.path.basename(path)[:-5]
        try: items = json.load(open(path, encoding="utf-8"))
        except Exception as e: print(f"[{fonte}] ilegível: {e}"); continue
        ok = 0
        for it in items:
            if not valid(it): continue
            fl = flags(f"{it.get('titulo','')} {it.get('descricao','')} {it.get('descricao_detalhe','')}")
            it["direitos_fiduciante"] = bool(it.get("direitos_fiduciante")) or fl["direitos_fiduciante"]
            it["fracao_ideal"] = fl["fracao_ideal"]
            k = key(it)
            if k in seen:
                # mantém o de menor lance; guarda a outra fonte em `tambem_em`
                prev = out[seen[k]]
                prev.setdefault("tambem_em", []).append({"fonte": it["fonte"], "url": it["url"], "lance_minimo": it["lance_minimo"]})
                if it["lance_minimo"] < prev["lance_minimo"]:
                    it["tambem_em"] = prev.get("tambem_em", []); out[seen[k]] = it
                continue
            seen[k] = len(out); out.append(it); ok += 1
        stats[fonte] = {"lidos": len(items), "validos": ok}
        print(f"[{fonte}] {len(items)} lidos, {ok} válidos únicos")
    out.sort(key=lambda x: -x["desagio_pct"])
    json.dump(out, open(os.path.join(ROOT, "web", "data", "imoveis.json"), "w", encoding="utf-8"), ensure_ascii=False)
    json.dump({"gerado_em": now_iso(), "total": len(out), "fontes": stats},
              open(os.path.join(ROOT, "web", "data", "meta.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"TOTAL {len(out)} imóveis -> web/data/imoveis.json")

if __name__ == "__main__": main()
