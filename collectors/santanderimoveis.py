"""Coletor Santander Imóveis (www.santanderimoveis.com.br), Brasil inteiro.

Portal WordPress (tema Apê11) com listagem server-side:
  Listagem: GET https://www.santanderimoveis.com.br/?pag=N   (9 cards/página; filtros opcionais uf=, cidade=)
            A página traz `var allImoveis = [...]` (JSON com codigo, tipo, cidade, uf, valorAvaliado,
            valorVenda, dataLeilao, dormitorios, vagas, urlLink...) e `var totalReg = N` (total geral).
  Detalhe:  página do lote (urlLink) — HTML server-side: endereço/CEP, Ocupado/Desocupado, valor avaliado,
            "A partir de" (lance), data do leilão, matrícula/RGI/inscrição, áreas, considerações
            importantes (débitos), condições de pagamento, leiloeiro + link "SAIBA MAIS" (site do leiloeiro),
            galeria em `property_vars.gallery` (JSON escapado).
  Não há API JSON pública (admin-ajax "call_api" é só para lead/auth). Sem WAF: requests simples com UA passa.

Modalidade: descProduto "Leilão" -> extrajudicial (imóveis retomados por alienação fiduciária, leilão pelo
leiloeiro parceiro, ex. Sold/Superbid); "Venda Direta"/"Venda Online" -> venda_direta.
Ordenação da listagem não é 100% estável entre páginas: dedup por código; se faltar muito, varre por UF.
"""
import re, sys, os, json, time, math
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bs4 import BeautifulSoup
from common import session, money, city, tipo, desagio, flags, now_iso, save_raw

FONTE = "santanderimoveis"
BASE = "https://www.santanderimoveis.com.br/"
PER_PAGE = 9
THREADS = 4
MAX = int(os.environ.get("GARIMPO_MAX", "0") or 0)
MAX_PAGES = int(os.environ.get("GARIMPO_PAGES", "0") or 0)

def _log(*a):
    print(f"[{FONTE}]", *a, file=sys.stderr)

def _get(s, url, params=None, tries=3):
    for i in range(tries):
        try:
            r = s.get(url, params=params, timeout=40)
            if r.status_code == 200:
                return r.text
            _log(f"HTTP {r.status_code} {url}")
        except Exception as e:
            _log(f"erro {e} {url}")
        time.sleep(1.5 * (i + 1))
    return None

def _txt(e):
    return re.sub(r"\s+", " ", e.get_text(" ", strip=True)) if e else ""

def _brl(s):
    """'R$ 3.671.000' (sem centavos) -> 3671000.0; common.money trataria o ponto como decimal."""
    s = re.sub(r"[^\d,\.]", "", str(s or ""))
    if not s: return None
    if "," not in s: s = s.replace(".", "")
    return money(s)

def _iso(t):
    m = re.search(r"(\d{4})-(\d{2})-(\d{2})", t or "")
    if m: return m.group(0)
    m = re.search(r"(\d{2})/(\d{2})/(\d{4})", t or "")
    return f"{m.group(3)}-{m.group(2)}-{m.group(1)}" if m else None

def _parse_list(html):
    m = re.search(r"var allImoveis = (\[.*?\]);\s*\n", html, re.S)
    if not m: return [], 0
    try:
        arr = json.loads(m.group(1))
    except ValueError:
        return [], 0
    t = re.search(r"var totalReg = (\d+)", html)
    total = int(t.group(1)) if t else (arr[0].get("totalReg") if arr else 0)
    return arr, total or 0

def _list_pages(s, params=None):
    params = dict(params or {})
    out, total, page = {}, None, 1
    while True:
        params["pag"] = page
        h = _get(s, BASE, params)
        if not h: break
        arr, tot = _parse_list(h)
        if total is None:
            total = tot
            _log(f"listagem {params}: totalReg={total}")
        for x in arr:
            if x.get("codigo"): out.setdefault(str(x["codigo"]), x)
        last = max(1, math.ceil((total or 0) / PER_PAGE))
        if page % 20 == 0 or page == last: _log(f"página {page}/{last}: {len(out)} únicos")
        if not arr or page >= last or (MAX_PAGES and page >= MAX_PAGES): break
        page += 1
        time.sleep(0.4)
    return out, total or 0

def _ufs(html):
    m = re.search(r"var allUfs = (\[.*?\]);", html, re.S)
    try:
        return [u["uf"] for u in json.loads(m.group(1))] if m else []
    except ValueError:
        return []

def _label_value(sp, label):
    for p in sp.select("section.main-info p"):
        if label.lower() in _txt(p).lower():
            st = p.select_one("strong")
            return _txt(st)
    return ""

def _section_text(sp, h2):
    for sec in sp.select("section.main-info"):
        t = sec.select_one("h2")
        if t and h2.lower() in _txt(t).lower():
            body = sec.get_text("\n", strip=True)
            return re.sub(r"^\s*" + re.escape(_txt(t)) + r"\s*", "", body).strip()
    return ""

def _detail(s, url):
    h = _get(s, url)
    time.sleep(0.3)
    d = {}
    if not h: return d
    sp = BeautifulSoup(h, "html.parser")
    top = sp.select_one("section.main-top")
    if top:
        p = top.select_one("p")
        d["endereco_full"] = _txt(p)
        st = _txt(top.select_one("strong")).lower()
        if "desocupad" in st: d["ocupado"] = False
        elif "ocupad" in st: d["ocupado"] = True
    box = sp.select_one("div.desktop") or sp
    for div in box.select("section.main-values > div"):
        lab = _txt(div.select_one("p")).lower()
        val = _txt(div.select_one("strong"))
        if "avaliad" in lab: d["avaliacao"] = _brl(val)
        elif "valor de venda" in lab: d["lance"] = _brl(re.sub(r"(?i)a partir de", "", val))
        elif "data do leil" in lab: d["data_leilao"] = _iso(lab)
    for p in box.select("section.main-values p"):
        if "data do leil" in _txt(p).lower(): d["data_leilao"] = _iso(_txt(p))
    at = box.select_one("section.main-atendimento")
    if at:
        d["leiloeiro"] = _txt(at.select_one("strong"))
        a = at.select_one("a.btn[href]")
        if a: d["leiloeiro_url"] = a["href"]
    d["matricula"] = _label_value(sp, "Matrícula")
    d["cartorio"] = _label_value(sp, "RGI")
    d["areas"] = _label_value(sp, "Área")
    d["iptu"] = _brl(_label_value(sp, "IPTU"))
    d["condominio"] = _brl(_label_value(sp, "condomínio"))
    d["consideracoes"] = _section_text(sp, "Considerações importantes")
    d["pagamento"] = _section_text(sp, "Condições de Pagamento")
    m = re.search(r'"gallery":"(.*?)"(?:,"|\})', h, re.S)
    fotos = []
    if m:
        try:
            raw = json.loads('"' + m.group(1) + '"')
            for g in json.loads(raw):
                u = (g.get("full") or g.get("small") or [None])[0]
                if u and u not in fotos: fotos.append(u)
        except ValueError:
            pass
    d["fotos"] = fotos
    return d

def _areas(txt):
    priv = terr = None
    for m in re.finditer(r"([\d.,]+)\s*m²?\s*(?:de\s*)?(?:área\s*)?([a-zç]+)", txt or "", re.I):
        v, k = money(m.group(1)), m.group(2).lower()
        if not v: continue
        if "terr" in k: terr = terr or v
        elif any(x in k for x in ("constru", "priv", "util", "útil", "total")): priv = priv or v
    return priv, terr

def _debitos(txt):
    for sent in re.split(r"(?<=[.;])\s+|\s+[a-z]\.\s+", txt or ""):
        if re.search(r"(?i)d[ée]bito|iptu|condom", sent): return sent.strip()[:400]
    return None

def _build(x, d):
    aval = x.get("valorAvaliado") or d.get("avaliacao")
    lance = x.get("valorVenda") or d.get("lance")
    if not lance or lance <= 0: return None
    if not aval or aval <= 0: aval = lance
    prod = (x.get("descProduto") or "").lower()
    if "leil" in prod: modalidade = "extrajudicial"
    elif "direta" in prod or "online" in prod: modalidade = "venda_direta"
    else: modalidade = "outro"
    cons = d.get("consideracoes") or ""
    pag = (d.get("pagamento") or "").lower()
    tt = tipo(x.get("descTipoImovel") or "")
    if tt == "outro": tt = tipo(x.get("seoH1") or x.get("urlLink") or "")
    priv, terr = _areas(d.get("areas"))
    if x.get("areaPrivativa"): priv = priv or float(x["areaPrivativa"])
    if x.get("areaTotal") and tt == "terreno": terr = terr or float(x["areaTotal"])
    end = d.get("endereco_full") or ""
    cep = re.search(r"CEP:?\s*(\d{5}-?\d{3})", end)
    logr = ", ".join(p for p in [x.get("logradrouro"), x.get("numeroResidencia")] if p)
    titulo = x.get("seoH1") or f"{x.get('descTipoImovel') or 'Imóvel'} na {x.get('logradrouro') or ''}".strip()
    deb = _debitos(cons)
    fl = flags(titulo + "\n" + cons)
    ocup = d.get("ocupado")
    if ocup is None and re.search(r"(?i)\bocupado", cons): ocup = True
    item = {
        "id": f"{FONTE}:{x['codigo']}",
        "fonte": FONTE,
        "url": x["urlLink"],
        "tipo": tt,
        "titulo": titulo,
        "endereco": logr or (end.split(",")[0] if end else None),
        "bairro": x.get("bairroDeclarado") or None,
        "cidade": city(x.get("descCidade") or ""),
        "uf": (x.get("uf") or "").upper(),
        "cep": cep.group(1) if cep else None,
        "area_privativa_m2": priv if tt != "terreno" else None,
        "area_terreno_m2": terr,
        "quartos": x.get("dormitorios") or None,
        "vagas": x.get("vagas") or None,
        "avaliacao": float(aval),
        "lance_minimo": float(lance),
        "desagio_pct": desagio(aval, lance),
        "modalidade": modalidade,
        "praca": None,
        "data_leilao": _iso(x.get("dataLeilao")) or d.get("data_leilao"),
        "data_fim": _iso(x.get("dataLeilao")) or d.get("data_leilao"),
        "ocupado": ocup,
        "leiloeiro": d.get("leiloeiro") or None,
        "leiloeiro_url": d.get("leiloeiro_url"),
        "matricula": d.get("matricula") or None,
        "cartorio": d.get("cartorio") or None,
        "codigo_santander": x.get("idExterno"),
        "aceita_financiamento": True if "financ" in pag else None,
        "aceita_fgts": True if "fgts" in pag else None,
        "debitos_regra": deb,
        "debitos_por_conta_comprador": (False if re.search(r"(?i)vendedor|quitad", deb) else (True if re.search(r"(?i)arrematante|comprador", deb) else None)) if deb else None,
        "direitos_fiduciante": fl["direitos_fiduciante"],
        "fracao_ideal": fl["fracao_ideal"],
        "fotos": d.get("fotos") or ([x["thumbnail"]] if x.get("thumbnail") else []),
        "descricao": (cons + ("\n\nCondições de pagamento: " + d["pagamento"] if d.get("pagamento") else ""))[:6000],
        "lat": x.get("latitude"), "lng": x.get("longitude"),
        "coletado_em": now_iso(),
    }
    return {k: v for k, v in item.items() if v is not None or k in ("praca", "ocupado", "data_leilao")}

def collect():
    s = session()
    cards, total = _list_pages(s)
    if total and len(cards) < total * 0.9 and not MAX_PAGES:
        h = _get(s, BASE)
        _log(f"só {len(cards)}/{total} na varredura geral; varrendo por UF")
        for uf in _ufs(h or ""):
            c, _ = _list_pages(s, {"uf": uf})
            for k, v in c.items(): cards.setdefault(k, v)
    cards = list(cards.values())
    if MAX: cards = cards[:MAX]
    _log(f"{len(cards)} lotes na listagem; buscando detalhes...")
    items, seen = [], set()
    def work(x):
        try:
            return _build(x, _detail(s, x["urlLink"]))
        except Exception as e:
            _log(f"falha {x.get('urlLink')}: {e}")
            return None
    with ThreadPoolExecutor(THREADS) as ex:
        for i, it in enumerate(ex.map(work, cards), 1):
            if it and it["id"] not in seen:
                seen.add(it["id"]); items.append(it)
            if i % 100 == 0: _log(f"detalhes {i}/{len(cards)}")
    return items

if __name__ == "__main__":
    save_raw(FONTE, collect())
