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
    """Vetos: venda de direitos de fiduciante e venda de fração/parte ideal.
    Ignora "fração ideal no/do terreno" (texto padrão de matrícula de apartamento)."""
    t = strip_accents((texto or "").lower())
    t = re.sub(r"fracao ideal[^.;]{0,40}?(no|do|de|sobre o|correspondente ao) (terreno|solo|lote|condominio)", " ", t)
    t = re.sub(r"fracao ideal (de|correspondente a) [\d.,]+ ?%? ?(m2|do terreno|das coisas|das partes|nas partes|das areas)", " ", t)
    fracao = bool(re.search(
        r"(venda|leilao|arrematacao|alienacao|direitos|penhora)[^.;]{0,60}(fracao|parte|metade|quinhao) ideal"
        r"|(fracao|parte|metade|quinhao) ideal (de|correspondente a|equivalente a) [\d.,]+ ?%"
        r"|\b\d{1,2}([.,]\d+)? ?% (da |de |do |dos )?(imovel|fracao|parte ideal|direitos|propriedade|nua propriedade)"
        r"|\b(50|33|25|20)% ?\(", t))
    return {
        # Venda de DIREITOS (aquisitivos, do compromissário, do fiduciante) em vez da propriedade.
        "direitos_fiduciante": bool(re.search(
            r"direitos? (do |de |da |dos )?(devedor |mutuario |parte executada )?fiduciante"
            r"|direitos? aquisitivos?[^.;]{0,120}fiducia"
            r"|devedora? fiduciante"
            r"|cessao (de |dos )?direitos fiduciari", t)),
        "direitos_aquisitivos": bool(re.search(
            r"direitos? aquisitivos?|direitos? (sobre|do|da) (o )?imovel|direitos? (do |da )?compromissari"
            r"|direitos? possessorios|cessao (de |dos )?direitos", t)),
        "fracao_ideal": fracao,
        # Enfiteuse: vende-se só o domínio útil (foro anual + laudêmio de 5% na revenda + anuência da SPU).
        "dominio_util": bool(re.search(r"dominio util|enfiteuse|enfiteutico|aforamento|terreno de marinha", t)),
        # Ônus ainda averbado que o comprador terá de cancelar por conta própria.
        "onus_averbado": bool(re.search(
            r"(gravame|penhora|indisponibilidade)[^.;]{0,60}averbad"
            r"|regularizacao por conta do adquirente"
            r"|onus[^.;]{0,40}por conta do (adquirente|comprador)", t)),
        # Massa falida: venda pelo juízo falimentar (costuma ser livre de ônus, mas o rito é longo).
        "massa_falida": bool(re.search(r"massa falida|falencia|juizo falimentar|recuperacao judicial", t)),
    }

def save_raw(fonte, items):
    os.makedirs(RAW, exist_ok=True)
    path = os.path.join(RAW, f"{fonte}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, indent=1)
    print(f"[{fonte}] {len(items)} imóveis -> {path}")
    return path
