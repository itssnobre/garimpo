"""Coletor Mega Leilões (www.megaleiloes.com.br/imoveis), Brasil inteiro.

Método: HTML + bs4 (site Yii/pjax, sem API JSON pública).
  Listagem: https://www.megaleiloes.com.br/imoveis?estado=UF&pagina=N  (48 cards/página, ul.pagination),
            iterando as 27 UFs (a UF real sai de .card-locality "Cidade, UF"; dedup por url).
  Detalhe:  página do lote (avaliação, localização, área, descrição, edital, matrícula, fotos, praças).

Cada lote exige 1 request de detalhe (é onde ficam avaliação e descrição). Requests em
paralelo (4 threads) com pausa curta; 0.5s entre páginas da listagem.

Limitações:
- Só entram lotes com status "Aberto para lances"/"Em breve"; encerrados/vendidos são descartados.
- Bairro só quando aparece no campo "Localização" (formato rua, nº, bairro, cidade, UF).
"""
import re, sys, os, time
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bs4 import BeautifulSoup
from common import session, money, city, tipo, desagio, flags, now_iso, save_raw

LIST = "https://www.megaleiloes.com.br/imoveis"
UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"]
THREADS = 4
MAX = int(os.environ.get("GARIMPO_MAX", "0") or 0)

def _get(s, url, params=None, tries=3):
    for i in range(tries):
        try:
            r = s.get(url, params=params, timeout=40)
            if r.status_code == 200:
                return r.text
            print(f"[megaleiloes] HTTP {r.status_code} {url}", file=sys.stderr)
        except Exception as e:
            print(f"[megaleiloes] erro {e} {url}", file=sys.stderr)
        time.sleep(1.5 * (i + 1))
    return None

def _date(t):
    m = re.search(r"(\d{2})/(\d{2})/(\d{4})", t or "")
    return f"{m.group(3)}-{m.group(2)}-{m.group(1)}" if m else None

def _txt(e):
    return re.sub(r"\s+", " ", e.get_text(" ", strip=True)) if e else ""

def _parse_card(c):
    a = c.select_one("a.card-title")
    if not a: return None
    url = a["href"].split("?")[0]
    code = _txt(c.select_one(".card-number"))
    m = re.search(r"[A-Z]?\d+$", code)
    sid = m.group(0) if m else url.rsplit("-", 1)[-1].upper()
    st = _txt(c.select_one(".card-status")).lower()
    loc = _txt(c.select_one(".card-locality"))
    mod = _txt(c.select_one(".card-instance-title a")).lower()
    return {
        "url": url, "id_fonte": sid, "titulo": _txt(a), "status": st, "localidade": loc,
        "modalidade_txt": mod, "praca_txt": _txt(c.select_one(".card-instances")),
        "lance_card": money(_txt(c.select_one(".card-instance-value")) or _txt(c.select_one(".card-price"))),
        "data_card": _date(_txt(c.select_one(".card-first-instance-date"))),
        "lote": _txt(c.select_one(".card-batch-number")),
    }

def _list_uf(s, uf):
    cards, page, last = [], 1, None
    while True:
        h = _get(s, LIST, {"estado": uf, "pagina": page})
        if not h: break
        sp = BeautifulSoup(h, "html.parser")
        found = [x for x in (_parse_card(c) for c in sp.select("div.card")) if x]
        cards.extend(found)
        if last is None:
            nums = [int(m.group(1)) for a in sp.select("ul.pagination a[href]") for m in [re.search(r"pagina=(\d+)", a["href"])] if m]
            last = max(nums) if nums else 1
        print(f"[megaleiloes] {uf} listagem página {page}/{last}: {len(found)} cards", file=sys.stderr)
        if not found or page >= last: break
        page += 1
        time.sleep(0.5)
    return cards

def _list_pages(s):
    cards = []
    for uf in UFS:
        cards.extend(_list_uf(s, uf))
        time.sleep(0.3)
    # dedup por url
    seen, out = set(), []
    for c in cards:
        if c["url"] in seen: continue
        seen.add(c["url"]); out.append(c)
    return out

def _debitos(desc):
    """Frase que fala de débitos de IPTU/condomínio (janela curta ao redor da 1ª ocorrência)."""
    for m in re.finditer(r"(?i)d[ée]bitos?", desc or ""):
        win = desc[m.start():m.start() + 300]
        if not re.search(r"(?i)iptu|condom", win): continue
        a = max((desc.rfind(x, max(0, m.start() - 160), m.start()) for x in (". ", "\n", "; ")), default=-1)
        start = a + 2 if a >= 0 else max(0, m.start() - 160)
        b = min((i for i in (desc.find(". ", m.end()), desc.find("\n", m.end())) if i >= 0), default=-1)
        end = b + 1 if b >= 0 and b - start < 350 else min(len(desc), start + 300)
        return desc[start:end].strip()
    return None

def _value_of(sp, header):
    for it in sp.select("div.item, .item"):
        hd = it.select_one(".header")
        if hd and header.lower() in _txt(hd).lower():
            return _txt(it.select_one(".value"))
    return ""

def _detail(s, card):
    h = _get(s, card["url"])
    time.sleep(0.2)
    d = {}
    if not h: return d
    sp = BeautifulSoup(h, "html.parser")
    aval_txt = _value_of(sp, "Avalia")
    d["avaliacao"] = money(aval_txt.split("(")[0]) if aval_txt else None
    d["localizacao"] = _value_of(sp, "Localiza")
    d["comitente"] = _value_of(sp, "Comitente")
    area = sp.find(string=re.compile(r"^\s*Área\s*$"))
    if area:
        d["area"] = money(re.sub(r"m2|m²", "", _txt(area.find_parent("span")).replace("Área", "")))
    desc = sp.select_one("#tab-description")
    d["descricao"] = re.sub(r"\n\s*\n+", "\n", desc.get_text("\n", strip=True)) if desc else ""
    pay = sp.select_one("#tab-payment-condition")
    d["pagamento"] = _txt(pay)
    for a in sp.select('a[href$=".pdf"]'):
        href = a["href"]
        if "edital" in href.lower() and "edital_url" not in d: d["edital_url"] = href
        if "matricula" in href.lower() and "matricula_url" not in d: d["matricula_url"] = href
    fotos, seen = [], set()
    for im in sp.select("img"):
        src = im.get("src") or im.get("data-src") or ""
        if "/batches/" in src and src not in seen:
            seen.add(src); fotos.append(src)
    d["fotos"] = fotos
    # praças (instances): a ativa é a vigente
    inst = []
    box = sp.select_one(".summary-info") or sp
    for e in box.select(".instance"):
        vals = money(_txt(e.select_one(".card-instance-value")))
        spans = [x for x in e.select("span") if any("instance-date" in c for c in (x.get("class") or []))]
        dts = [_date(_txt(x)) for x in spans]
        lab = _txt(spans[-1].select_one("b")) if spans and spans[-1].select_one("b") else ""
        mp = re.search(r"(\d)", lab)
        inst.append({"ativa": "active" in (e.get("class") or []), "valor": vals, "data": [x for x in dts if x][-1] if dts else None,
                     "praca": int(mp.group(1)) if mp else None})
    d["instances"] = inst
    st = _txt(box.select_one(".instance-text")).lower()
    if st: d["status"] = st
    return d

def _build(card, d):
    desc = d.get("descricao") or ""
    loc = d.get("localizacao") or ""
    parts = [p.strip() for p in loc.split(",")]
    cid, bairro, endereco = None, None, None
    uf = None
    m = re.match(r"(.+?),\s*([A-Z]{2})$", card["localidade"])
    if m: cid, uf = m.group(1), m.group(2)
    if not uf and len(parts) >= 2 and re.fullmatch(r"[A-Z]{2}", parts[-1]): uf = parts[-1]
    if not uf: return None
    if len(parts) >= 4:
        endereco = ", ".join(parts[:-3]); bairro = parts[-3]
    elif len(parts) == 3:
        endereco = parts[0]; bairro = None
    if not cid and len(parts) >= 2: cid = parts[-2]

    inst = d.get("instances") or []
    active = [i for i in inst if i["ativa"] and i["valor"]]
    praca = None
    pt = (card.get("praca_txt") or "").lower()
    mp = re.search(r"(\d)", pt)
    if mp: praca = int(mp.group(1))
    elif "única" in pt or "unica" in pt: praca = 1
    if active:
        lance, data = active[0]["valor"], active[0]["data"]
        if active[0].get("praca"): praca = active[0]["praca"]
        elif len(inst) > 1: praca = inst.index(active[0]) + 1
    else:
        lance, data = card["lance_card"], card["data_card"]
    aval = d.get("avaliacao") or lance
    mod = card["modalidade_txt"]
    if "judicial" in mod and "extra" not in mod: modalidade = "judicial"
    elif "extrajudicial" in mod: modalidade = "extrajudicial"
    elif "direta" in mod: modalidade = "venda_direta"
    else: modalidade = "outro"
    low = desc.lower()
    ocupado = None
    if re.search(r"\bdesocupad", low): ocupado = False
    elif re.search(r"\bocupad", low): ocupado = True
    mat = re.search(r"matr[ií]cula\(?s?\)?:?\s*(?:n[º°o.]*\s*)?([\d\.]+)", desc, re.I)
    cart = re.search(r"(?:cart[óo]rio:\s*|(?:do|no)\s+)(\d{1,2}\s*[º°oa]?\s*(?:CRI|Cart[óo]rio|Of[ií]cio|Registro)[^\.\n\-–,;]{0,60})", desc, re.I)
    fl = flags(card["titulo"] + "\n" + desc)
    pag = (d.get("pagamento") or "").lower()
    deb = _debitos(desc)
    tt = tipo(card["titulo"])
    if tt == "outro": tt = tipo(card["url"].split("/imoveis/")[-1].split("/")[0])
    item = {
        "id": f"megaleiloes:{card['id_fonte']}",
        "fonte": "megaleiloes",
        "url": card["url"],
        "tipo": tt,
        "titulo": card["titulo"],
        "endereco": endereco,
        "bairro": bairro,
        "cidade": city(cid or ""),
        "uf": uf,
        "area_privativa_m2": d.get("area") if tt != "terreno" else None,
        "area_terreno_m2": d.get("area") if tt == "terreno" else None,
        "avaliacao": aval,
        "lance_minimo": lance,
        "desagio_pct": desagio(aval, lance),
        "modalidade": modalidade,
        "praca": praca,
        "data_leilao": data,
        "data_fim": data,
        "ocupado": ocupado,
        "aceita_financiamento": True if "financ" in pag else None,
        "aceita_fgts": True if "fgts" in pag else None,
        "debitos_regra": deb,
        "debitos_por_conta_comprador": (True if re.search(r"(arrematante|comprador)", deb, re.I) and not re.search(r"(vendedor|comitente|quitad)", deb, re.I) else (False if re.search(r"(vendedor|comitente|quitad)", deb, re.I) else None)) if deb else None,
        "direitos_fiduciante": fl["direitos_fiduciante"],
        "fracao_ideal": fl["fracao_ideal"],
        "matricula": mat.group(1) if mat else None,
        "cartorio": cart.group(1).strip() if cart else None,
        "edital_url": d.get("edital_url"),
        "matricula_url": d.get("matricula_url"),
        "fotos": d.get("fotos") or [],
        "descricao": desc[:6000],
        "coletado_em": now_iso(),
    }
    return {k: v for k, v in item.items() if v is not None or k in ("praca", "ocupado", "data_leilao")}

def collect():
    s = session()
    cards = _list_pages(s)
    skip = ("encerrad", "vendido", "suspens", "cancelad", "retirad")
    cards = [c for c in cards if not any(k in c["status"] for k in skip)]
    if MAX: cards = cards[:MAX]
    print(f"[megaleiloes] {len(cards)} lotes ativos (Brasil); buscando detalhes...", file=sys.stderr)
    items = []
    def work(c):
        try:
            return _build(c, _detail(s, c))
        except Exception as e:
            print(f"[megaleiloes] falha {c['url']}: {e}", file=sys.stderr)
            return None
    seen = set()
    with ThreadPoolExecutor(THREADS) as ex:
        for i, it in enumerate(ex.map(work, cards), 1):
            if it and it.get("lance_minimo") and it["id"] not in seen:
                seen.add(it["id"]); items.append(it)
            if i % 50 == 0: print(f"[megaleiloes] detalhes {i}/{len(cards)}", file=sys.stderr)
    return items

if __name__ == "__main__":
    save_raw("megaleiloes", collect())
