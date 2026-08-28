"""Coletor Bradesco — Vitrine de Leilões (vitrinebradesco.com.br), Brasil inteiro.

banco.bradesco/.../leiloes aponta para a "Vitrine" (SPA React, feita pela Hallo) que agrega os lotes do Bradesco
vendidos por leiloeiros parceiros (Zuk, Milan, Pestana, Vip, Mega, Sodré, Freitas...). API pública, sem chave:
  Base:     https://api.vitrinebradesco.com.br
  Listagem: GET /v1/auctions?type=realstate&page=N  -> {"total_pages", "total_auctions", "data":[30 lotes]}
            (sem `type` mistura veículos; type=vehicles são veículos). Filtros: state, city, category, price_min/max, q.
  Detalhe:  GET /v1/auctions/<slug> -> address, url (página do lote no site do leiloeiro), auction_location.
  Página do lote na vitrine: https://vitrinebradesco.com.br/auctions/<slug>
Campos: price (lance vigente), min_auction_value_1/2 + date_auction_1/2 (praças; só nos de alienação fiduciária),
auction_date, realstate_auction_type (alienacao-fiduciaria | convencional), category, description (HTML), images.

Modalidade: alienacao-fiduciaria -> extrajudicial; convencional (imóvel próprio do banco, leilão online do
leiloeiro) -> venda_online. Avaliação = min_auction_value_1 (1ª praça) quando existe, senão tenta "avaliação/avaliado
R$ X" na descrição, senão = price (deságio 0). Só lotes com auction_date >= hoje.
"""
import re, sys, os, time, datetime as dt
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import session, money, city, tipo, desagio, flags, now_iso, save_raw

FONTE = "bradesco"
API = "https://api.vitrinebradesco.com.br/v1/auctions"
SITE = "https://vitrinebradesco.com.br/auctions/"
THREADS = 4
MAX = int(os.environ.get("GARIMPO_MAX", "0") or 0)
MAX_PAGES = int(os.environ.get("GARIMPO_PAGES", "0") or 0)

def _log(*a):
    print(f"[{FONTE}]", *a, file=sys.stderr)

def _get_json(s, url, params=None, tries=3):
    for i in range(tries):
        try:
            r = s.get(url, params=params, timeout=40)
            if r.status_code == 200:
                return r.json()
            if r.status_code == 404: return None
            _log(f"HTTP {r.status_code} {url} {params or ''}")
        except Exception as e:
            _log(f"erro {e} {url}")
        time.sleep(1.5 * (i + 1))
    return None

def _list(s):
    out, page, last = {}, 1, None
    while True:
        d = _get_json(s, API, {"type": "realstate", "page": page})
        if not d or not isinstance(d.get("data"), list): break
        for x in d["data"]:
            if x.get("slug"): out.setdefault(x["slug"], x)
        if last is None:
            last = int(d.get("total_pages") or 1)
            _log(f"listagem: total_auctions={d.get('total_auctions')} páginas={last}")
        if not d["data"] or page >= last or (MAX_PAGES and page >= MAX_PAGES): break
        page += 1
        time.sleep(0.4)
    return list(out.values())

def _num(v):
    try:
        v = float(v)
        return v if v > 0 else None
    except (TypeError, ValueError):
        return None

def _date(v):
    m = re.search(r"(\d{4}-\d{2}-\d{2})", str(v or ""))
    return m.group(1) if m else None

def _clean(html):
    t = re.sub(r"(?i)<br\s*/?>|</p>|</h\d>|</center>", "\n", html or "")
    t = re.sub(r"<[^>]+>", "", t)
    t = t.replace("&nbsp;", " ").replace("&amp;", "&").replace("&quot;", '"')
    return re.sub(r"\n\s*\n+", "\n", t).strip()

def _build(x, d):
    d = d or {}
    lance = _num(x.get("price")) or _num(d.get("price"))
    if not lance: return None
    desc = _clean(d.get("description") or x.get("description"))
    v1, v2 = _num(x.get("min_auction_value_1")), _num(x.get("min_auction_value_2"))
    aval = v1 if v1 and v1 >= lance else None
    if not aval:
        m = re.search(r"(?i)avalia[çc][ãa]o[^R$\n]{0,40}R\$\s*([\d\.]+,\d{2}|[\d\.]+)", desc)
        aval = money(m.group(1)) if m else None
        if aval and aval < lance: aval = None
    aval = aval or lance
    today = dt.date.today().isoformat()
    d1, d2 = _date(x.get("date_auction_1")), _date(x.get("date_auction_2"))
    praca = None
    if d1 and d2: praca = 2 if today > d1 else 1
    elif d1: praca = 1
    rt = (x.get("realstate_auction_type") or "").lower()
    modalidade = "extrajudicial" if "fiduci" in rt else ("venda_online" if "convenc" in rt else "outro")
    if re.search(r"(?i)leil[ãa]o judicial|hasta p[úu]blica", desc) and "fiduci" not in rt:
        modalidade = "judicial"
    low = desc.lower()
    ocup = False if re.search(r"\bdesocupad", low) else (True if re.search(r"\bocupad", low) else None)
    mat = re.search(r"matr[ií]cula\(?s?\)?\s*(?:n[º°o.]*\s*)?([\d\.]+)", desc, re.I)
    cart = re.search(r"(\d{1,2}\s*[º°oa]?\s*(?:CRI|RI|Cart[óo]rio|Of[ií]cio|Registro de Im[óo]veis)[^\.\n,;]{0,50})", desc, re.I)
    ap = re.search(r"[áa]rea\s+(?:privativa|[úu]til|constru[íi]da)[^\d]{0,15}([\d\.]+,\d+|\d+)", desc, re.I)
    at = re.search(r"[áa]rea\s+(?:do\s+|de\s+)?(?:terreno|total)[^\d]{0,15}([\d\.]+,\d+|\d+)", desc, re.I)
    deb = None
    for sent in re.split(r"(?<=[.;])\s+|\n", desc):
        if re.search(r"(?i)d[ée]bito", sent) and re.search(r"(?i)iptu|condom|imposto|taxa|incident|respons|conta d", sent):
            deb = sent.strip()[:400]; break
    tt = tipo(x.get("category") or "")
    if tt == "outro": tt = tipo(x.get("name") or "")
    if (x.get("category") or "").lower() in ("sítio", "sitio", "imóvel rural", "imovel rural"): tt = "rural"
    fl = flags((x.get("name") or "") + "\n" + desc)
    au = x.get("auctioneer") or {}
    item = {
        "id": f"{FONTE}:{x.get('guid') or x['slug']}",
        "fonte": FONTE,
        "url": SITE + x["slug"],
        "tipo": tt,
        "titulo": x.get("name") or "",
        "endereco": d.get("address") or None,
        "bairro": city(x.get("neighborhood") or "") or None,
        "cidade": city(x.get("city") or ""),
        "uf": (x.get("state") or "").upper(),
        "area_privativa_m2": money(ap.group(1)) if ap and tt != "terreno" else None,
        "area_terreno_m2": money(at.group(1)) if at else None,
        "avaliacao": aval,
        "lance_minimo": lance,
        "desagio_pct": desagio(aval, lance),
        "modalidade": modalidade,
        "modalidade_txt": rt or None,
        "praca": praca,
        "data_leilao": _date(x.get("auction_date")) or d2 or d1,
        "data_fim": _date(x.get("auction_date")) or d2 or d1,
        "lance_1a_praca": v1,
        "lance_2a_praca": v2,
        "ocupado": ocup,
        "leiloeiro": au.get("name") or None,
        "leiloeiro_url": d.get("url") or None,
        "matricula": mat.group(1) if mat else None,
        "cartorio": cart.group(1).strip() if cart else None,
        "debitos_regra": deb,
        "debitos_por_conta_comprador": (True if re.search(r"(?i)comprador|arrematante", deb) and not re.search(r"(?i)vendedor|quitad", deb) else (False if re.search(r"(?i)vendedor|quitad", deb) else None)) if deb else None,
        "direitos_fiduciante": fl["direitos_fiduciante"],
        "fracao_ideal": fl["fracao_ideal"],
        "fotos": [u for u in (x.get("images") or []) if u],
        "descricao": desc[:6000],
        "coletado_em": now_iso(),
    }
    return {k: v for k, v in item.items() if v is not None or k in ("praca", "ocupado", "data_leilao")}

def collect():
    s = session()
    s.headers.update({"Origin": "https://vitrinebradesco.com.br", "Referer": "https://vitrinebradesco.com.br/", "Accept": "application/json"})
    today = dt.date.today().isoformat()
    cards = _list(s)
    cards = [c for c in cards if (c.get("type") or "realstate") == "realstate" and (not _date(c.get("auction_date")) or _date(c["auction_date"]) >= today)]
    if MAX: cards = cards[:MAX]
    _log(f"{len(cards)} lotes de imóveis ativos; buscando detalhes...")
    items, seen = [], set()
    def work(x):
        try:
            d = _get_json(s, API + "/" + x["slug"])
            time.sleep(0.3)
            return _build(x, (d or {}).get("data", d) if isinstance(d, dict) else None)
        except Exception as e:
            _log(f"falha {x.get('slug')}: {e}")
            return None
    with ThreadPoolExecutor(THREADS) as ex:
        for i, it in enumerate(ex.map(work, cards), 1):
            if it and it["id"] not in seen:
                seen.add(it["id"]); items.append(it)
            if i % 100 == 0: _log(f"detalhes {i}/{len(cards)}")
    return items

if __name__ == "__main__":
    save_raw(FONTE, collect())
