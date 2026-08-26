"""Utilitários compartilhados pelos coletores."""
import json, os, re, unicodedata, datetime as dt
import requests

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "data", "raw")
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"

def session():
    s = requests.Session()
    s.headers.update({"User-Agent": UA, "Accept-Language": "pt-BR,pt;q=0.9"})
    return s

def now_iso():
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()

def money(s):
    """'R$ 123.456,78' -> 123456.78"""
    if s is None: return None
    if isinstance(s, (int, float)): return float(s)
    s = re.sub(r"[^\d,\.]", "", str(s))
    if not s: return None
    if "," in s: s = s.replace(".", "").replace(",", ".")
    try: return float(s)
    except ValueError: return None

def strip_accents(s):
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")

def city(s):
    if not s: return ""
    s = re.sub(r"\s+", " ", str(s)).strip()
    return " ".join(w.capitalize() if len(w) > 2 else w.lower() for w in s.split(" "))

def tipo(s):
    t = strip_accents((s or "").lower())
    for k, v in [("apart", "apartamento"), ("casa", "casa"), ("sobrado", "casa"), ("terreno", "terreno"), ("lote", "terreno"),
                 ("gleba", "terreno"), ("comerc", "comercial"), ("loja", "comercial"), ("sala", "comercial"), ("galp", "comercial"),
                 ("predio", "comercial"), ("rural", "rural"), ("chacara", "rural"), ("sitio", "rural"), ("fazenda", "rural")]:
        if k in t: return v
    return "outro"

def desagio(avaliacao, lance):
    if not avaliacao or not lance or avaliacao <= 0: return 0.0
    return round(max(0.0, 1 - lance / avaliacao), 4)

def flags(texto):
    t = strip_accents((texto or "").lower())
    return {
        "direitos_fiduciante": bool(re.search(r"direitos? (do|de) (devedor )?fiduciante|cessao de direitos", t)),
        "fracao_ideal": bool(re.search(r"fracao ideal|parte ideal|\b\d{1,2}([.,]\d+)?\s?% (do|de) im[o]vel", t)),
    }

def save_raw(fonte, items):
    os.makedirs(RAW, exist_ok=True)
    path = os.path.join(RAW, f"{fonte}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, indent=1)
    print(f"[{fonte}] {len(items)} imóveis -> {path}")
    return path
