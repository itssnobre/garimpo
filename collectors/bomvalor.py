"""Coletor Bomvalor (bomvalor.com.br -> mercado.bomvalor.com.br), marketplace de leilões
corporativos/judiciais (leiloeiros parceiros: imóveis.io, Paulo Tolentino, Muniz...), Brasil inteiro.

Método: HTML + bs4 (Laravel/Blade; sem API JSON pública).
  Listagem: GET https://mercado.bomvalor.com.br/busca/categoria/imoveis?page=N  (30 cards/página;
            com header X-Requested-With: XMLHttpRequest devolve só o fragmento dos cards;
            termina quando a página vem sem cards). A página 1 completa traz também um JSON
            em #info-lote-mapa[data-lote] com localizacao (UF/cidade/endereço/lat/lon) por slug.
  Detalhe:  página do lote /imoveis/<tipo>/<slug>-<id> (descrição, VALOR DE REFERÊNCIA,
            encerramento, PDFs de condições/registro, matrícula/processo no texto).

Limitações:
- O site não publica "avaliação": avaliacao = valor de referência (deságio 0), salvo quando a
  descrição traz "Avaliação: R$ X".
- Modalidade: processo/vara/juízo na página + badge "Leilão" -> judicial; judicial + badge
  "Compra por Proposta" (alienação por iniciativa particular, imóveis.io) -> venda_direta;
  demais (leilão corporativo, compra imediata) -> venda_online.
- "Local:" na página é o endereço do leiloeiro, NÃO do imóvel; UF sai do JSON do mapa,
  do título ("Cidade/UF") ou da descrição.
"""
import re, sys, os, time, json, html as htmlmod
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bs4 import BeautifulSoup
from common import session, money, city, tipo, desagio, flags, now_iso, save_raw

FONTE = "bomvalor"
BASE = "https://mercado.bomvalor.com.br"
LIST = BASE + "/busca/categoria/imoveis"
THREADS = 3
MAX = int(os.environ.get("GARIMPO_MAX", "0") or 0)
UFS = {"AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"}
MESES = {"jan": 1, "fev": 2, "mar": 3, "abr": 4, "mai": 5, "jun": 6, "jul": 7, "ago": 8, "set": 9, "out": 10, "nov": 11, "dez": 12}

def _get(s, url, params=None, xhr=False, tries=3):
    h = {"X-Requested-With": "XMLHttpRequest"} if xhr else {}
    for i in range(tries):
        try:
            r = s.get(url, params=params, headers=h, timeout=60)
            if r.status_code == 200:
                return r.text
            print(f"[{FONTE}] HTTP {r.status_code} {url}", file=sys.stderr)
            if r.status_code == 404: return None
        except Exception as e:
            print(f"[{FONTE}] erro {e} {url}", file=sys.stderr)
        time.sleep(2 * (i + 1))
    return None

def _txt(e):
    return re.sub(r"\s+", " ", e.get_text(" ", strip=True)) if e else ""

def _date(t):
    m = re.search(r"(\d{2})/(\d{2})/(\d{4})", t or "")
    if m: return f"{m.group(3)}-{m.group(2)}-{m.group(1)}"
    m = re.search(r"(\d{1,2}) de ([a-zç]{3})[a-zç.]* de (\d{4})", (t or "").lower())
    if m and m.group(2)[:3] in MESES: return f"{m.group(3)}-{MESES[m.group(2)[:3]]:02d}-{int(m.group(1)):02d}"
    return None

def _cards(html):
    sp = BeautifulSoup(html, "html.parser")
    out = []
    for a in sp.select("a.link-leilao[href]"):
        href = a["href"]
        if "/imoveis/" not in href and "/lote" not in href: continue
        url = href if href.startswith("http") else BASE + href
        m = re.search(r"-(\d+)/?$", href)
        badge = _txt(a.select_one(".tw-absolute.tw-top-\\[10px\\] p")) or _txt(a.select_one("p.tw-truncate"))
        praca = _txt(a.select_one(".tw-inline-block.tw-uppercase"))
        dates = [x for x in (_date(_txt(p)) for p in a.select("p.tw-font-bold")) if x]
        price = None
        for sp_ in a.select("span"):
            if "R$" in sp_.get_text():
                price = money(_txt(sp_)); break
        idev = re.search(r"ID:\s*(\d+)", _txt(a))
        out.append({"url": url, "code": m.group(1) if m else (a.get("data-id") or url.rsplit("-", 1)[-1]),
                    "data_id": a.get("data-id"), "titulo": _txt(a.select_one("h5")), "badge": badge,
                    "praca_txt": praca, "data": dates[0] if dates else None, "lance_card": price,
                    "evento_id": idev.group(1) if idev else None})
    return out

def _mapa(html):
    """JSON do mapa da página 1: slug -> localizacao."""
    sp = BeautifulSoup(html, "html.parser")
    e = sp.select_one("#info-lote-mapa[data-lote]")
    out = {}
    if not e: return out
    try:
        for x in json.loads(e["data-lote"]):
            out[x.get("nm_slug") or ""] = x.get("localizacao") or {}
    except Exception as ex:
        print(f"[{FONTE}] mapa JSON: {ex}", file=sys.stderr)
    return out

def _list(s):
    cards, page, mapa = [], 1, {}
    while True:
        h = _get(s, LIST, {"page": page} if page > 1 else None, xhr=page > 1)
        if not h: break
        if page == 1: mapa = _mapa(h)
        found = _cards(h)
        print(f"[{FONTE}] listagem página {page}: {len(found)} cards", file=sys.stderr)
        if not found: break
        cards.extend(found)
        if MAX and len(cards) >= MAX: break
        page += 1
        time.sleep(0.6)
        if page > 200: break
    seen, out = set(), []
    for c in cards:
        if c["url"] in seen: continue
        seen.add(c["url"]); out.append(c)
    return out, mapa

def _detail(s, c):
    h = _get(s, c["url"])
    time.sleep(0.3)
    d = {}
    if not h: return d
    sp = BeautifulSoup(h, "html.parser")
    desc = sp.select_one(".bv-descricao-bem") or sp.select_one(".descricao")
    d["descricao"] = re.sub(r"\n\s*\n+", "\n", desc.get_text("\n", strip=True)) if desc else ""
    d["valor_ref"] = money(_txt(sp.select_one(".bv-vl-lance")).split("R$")[-1]) if sp.select_one(".bv-vl-lance") else None
    box = sp.select_one(".info-praca-lance")
    box = box.parent if box else sp
    d["evento_txt"] = _txt(box.select_one(".bv-nm-evento"))
    enc = box.find(string=re.compile(r"Encerramento"))
    d["encerramento"] = _date(enc.parent.get_text()) if enc else None
    ab = sp.find(string=re.compile(r"Data de Abertura"))
    d["abertura"] = _date(ab.parent.get_text()) if ab else None
    h1 = sp.select_one("h1")
    d["titulo_h1"] = _txt(h1)
    if h1:
        nx = h1.find_next(["p", "span", "div"])
        d["endereco_txt"] = _txt(nx)[:200] if nx else ""
    pdfs = {}
    for a in sp.select('a[href$=".pdf"], a[href$=".PDF"]'):
        href, t = a["href"], (_txt(a) + " " + (a.get("title") or "")).lower()
        if "CONDICAO" in href.upper() or "condi" in t: pdfs.setdefault("edital", href)
        elif "matric" in t: pdfs.setdefault("matricula", href)
    d.update(pdfs)
    fotos = []
    for e in sp.select('[style*="background-image"], img[src*="cloudfront"]'):
        src = e.get("src") or re.search(r"url\((.*?)\)", e.get("style") or "")
        if src and not isinstance(src, str): src = src.group(1).strip("'\"")
        if src and "/fotos/" in src and "nao-disponivel" not in src and src not in fotos: fotos.append(src)
    d["fotos"] = fotos[:20]
    d["jud"] = bool(re.search(r"judicial|vara\b|processo|tribunal", _txt(sp.select_one(".bv-area-informacoes-leilao") or sp.select_one("body")), re.I))
    return d

def _uf_city(c, d, loc):
    uf = (loc or {}).get("nm_estado")
    cid = (loc or {}).get("nm_cidade")
    if uf and uf.upper() in UFS: return uf.upper(), cid
    txt = " ".join(x for x in (c["titulo"], d.get("titulo_h1"), d.get("endereco_txt"), (d.get("descricao") or "")[:800]) if x)
    for m in re.finditer(r"([A-ZÀ-Úa-zà-ú' .]{3,40}?)\s*[/\-–]\s*([A-Z]{2})\b", txt):
        if m.group(2) in UFS:
            return m.group(2), m.group(1).strip(" -,")
    m = re.search(r"\b([A-Z]{2})\b\s*$", c["titulo"].strip())
    if m and m.group(1) in UFS: return m.group(1), None
    return None, None

def _build(c, d, loc):
    uf, cid = _uf_city(c, d, loc)
    if not uf: return None
    desc = d.get("descricao") or ""
    lance = d.get("valor_ref") or c.get("lance_card")
    if not lance: return None
    aval = None
    m = re.search(r"avalia[çc][ãa]o[^R\n]{0,30}R\$\s*([\d\.]+,\d{2})", desc, re.I)
    if m: aval = money(m.group(1))
    if not aval or aval < lance: aval = lance
    tt = tipo(c["url"].split("/imoveis/")[-1].split("/")[0].replace("-", " ")) if "/imoveis/" in c["url"] else "outro"
    if tt == "outro": tt = tipo(c["titulo"])
    if tt == "outro" and re.search(r"galp|industrial|pr[ée]dio|sala|loja", c["url"] + c["titulo"], re.I): tt = "comercial"
    badge = (c.get("badge") or "").lower()
    jud = bool(d.get("jud") and re.search(r"processo|vara|ju[ií]zo", desc, re.I))
    if jud and "proposta" in badge: modalidade = "venda_direta"   # alienação judicial por proposta (imóveis.io)
    elif jud: modalidade = "judicial"
    else: modalidade = "venda_online"
    pr = (c.get("praca_txt") or d.get("evento_txt") or "").lower()
    praca = 2 if re.search(r"2[ªa°º]", pr) else (1 if re.search(r"1[ªa°º]|única|unica", pr) else None)
    data = d.get("encerramento") or c.get("data") or d.get("abertura")
    ocupado = None
    if re.search(r"\bdesocupad", desc, re.I): ocupado = False
    elif re.search(r"\bocupad", desc, re.I): ocupado = True
    mat = re.search(r"matr[ií]cula(?:\s+do\s+bem)?\s*(?:n[º°o.]*)?:?\s*([\d\.]{3,})", desc, re.I)
    proc = re.search(r"processo:?\s*n?[º°.]?\s*([\d\.\-]{15,25})", desc, re.I)
    vara = re.search(r"ju[ií]zo:?\s*([^\n]{5,90})", desc, re.I)
    cart = re.search(r"cart[óo]rio(?: de registro)?:?\s*([^\n]{5,90})", desc, re.I)
    cep = re.search(r"CEP:?\s*(\d{5}-?\d{3})", desc)
    at = re.search(r"[áa]rea (?:total )?(?:do terreno)?:?\s*([\d\.]+,\d+|\d+)\s*m", desc, re.I)
    ac = re.search(r"[áa]rea (?:constru[ií]da|privativa|útil|util):?\s*([\d\.]+,\d+|\d+)\s*m", desc, re.I)
    fl = flags(c["titulo"] + "\n" + desc)
    loc = loc or {}
    item = {
        "id": f"{FONTE}:{c['code']}",
        "fonte": FONTE,
        "url": c["url"],
        "tipo": tt,
        "titulo": c["titulo"] or d.get("titulo_h1") or "",
        "endereco": loc.get("nm_endereco") or None,
        "cep": cep.group(1) if cep else None,
        "cidade": city(cid or ""),
        "uf": uf,
        "area_privativa_m2": money(ac.group(1)) if ac else None,
        "area_terreno_m2": money(at.group(1)) if at else None,
        "avaliacao": aval,
        "lance_minimo": lance,
        "desagio_pct": desagio(aval, lance),
        "modalidade": modalidade,
        "modalidade_fonte": c.get("badge") or None,
        "praca": praca,
        "data_leilao": data,
        "data_fim": data,
        "leiloeiro": "Bomvalor",
        "processo": proc.group(1) if proc else None,
        "vara": vara.group(1).strip() if vara else None,
        "matricula": mat.group(1) if mat else None,
        "cartorio": cart.group(1).strip() if cart else None,
        "ocupado": ocupado,
        "fotos": d.get("fotos") or [],
        "edital_url": d.get("edital"),
        "matricula_url": d.get("matricula"),
        "direitos_fiduciante": fl["direitos_fiduciante"],
        "fracao_ideal": fl["fracao_ideal"],
        "descricao": desc[:6000],
        "coletado_em": now_iso(),
    }
    return {k: v for k, v in item.items() if v is not None or k in ("praca", "ocupado", "data_leilao")}

def collect():
    s = session()
    cards, mapa = _list(s)
    if MAX: cards = cards[:MAX]
    print(f"[{FONTE}] {len(cards)} lotes de imóveis; buscando detalhes...", file=sys.stderr)
    items, seen = [], set()
    def work(c):
        try:
            slug = c["url"].replace(BASE + "/", "")
            return _build(c, _detail(s, c), mapa.get(slug))
        except Exception as e:
            print(f"[{FONTE}] falha {c['url']}: {e}", file=sys.stderr)
            return None
    with ThreadPoolExecutor(THREADS) as ex:
        for i, it in enumerate(ex.map(work, cards), 1):
            if it and it["id"] not in seen:
                seen.add(it["id"]); items.append(it)
            if i % 50 == 0: print(f"[{FONTE}] detalhes {i}/{len(cards)}", file=sys.stderr)
    return items

if __name__ == "__main__":
    save_raw(FONTE, collect())
