"""Coletor Lance Judicial / Grupo Lance (lancejudicial.com.br -> grupolance.com.br).

Método: HTML puro (site Yii2 + jQuery; não há API JSON pública de lotes, o único
ajax é do auditório de lances). Listagem filtrada por UF em
`/imoveis/sp?pagina=N` (32 cards por página; `per-page` é ignorado). Cada card
já traz título, valor atual, modalidade, cidade, status e as praças (datas +
valores). A página do lote é aberta para pegar avaliação, descrição, endereço,
fotos (cdn.grupolance.com.br), edital (PDF) e link da matrícula (data-url em
base64 -> /lote/baixar-documento/<id>/<tipo>).
Responde 200 com o UA de common.py; sem bloqueio observado. Porém o servidor
exige TLS 1.3 e o Python 3.9 do sistema (LibreSSL 2.8.3) falha com
"tlsv1 alert protocol version"; nesse caso o coletor cai automaticamente para
`curl` via subprocess com os mesmos headers.
"""
import base64, datetime as dt, re, sys, time, os, subprocess
from bs4 import BeautifulSoup

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import session, money, city, tipo, desagio, flags, now_iso, save_raw

BASE = "https://www.grupolance.com.br"
FONTE = "lancejudicial"
S = session()
USE_CURL = False


def _fetch(url):
    global USE_CURL
    if not USE_CURL:
        try:
            r = S.get(url, timeout=30)
            return r.status_code, r.text
        except Exception as e:
            if "SSL" not in str(e) and "TLS" not in str(e): raise
            print(f"[{FONTE}] SSL do Python falhou ({e.__class__.__name__}); usando curl")
            USE_CURL = True
    hdr = [f"{k}: {v}" for k, v in S.headers.items() if k in ("User-Agent", "Accept-Language")]
    cmd = ["curl", "-sL", "--max-time", "40", "-w", "\n%{http_code}"] + sum([["-H", h] for h in hdr], []) + [url]
    out = subprocess.run(cmd, capture_output=True, text=True, timeout=60).stdout
    body, _, code = out.rpartition("\n")
    return int(code or 0), body


def get(url, tries=3, sleep=0.5):
    for i in range(tries):
        try:
            code, text = _fetch(url)
            if code == 200 and "Just a moment" not in text[:3000]:
                return text
            print(f"[{FONTE}] HTTP {code} {url}")
        except Exception as e:
            print(f"[{FONTE}] erro {e} {url}")
        time.sleep(sleep * (i + 1))
    return None


def parse_dt(s):
    m = re.search(r"(\d{2})/(\d{2})/(\d{4})(?:\s*às\s*(\d{2}):(\d{2}))?", s or "")
    if not m: return None
    d, mo, y, h, mi = m.groups()
    return dt.datetime(int(y), int(mo), int(d), int(h or 0), int(mi or 0))


def iso(d):
    return d.strftime("%Y-%m-%d") if d else None


def modalidade(s):
    t = (s or "").lower()
    if "extra" in t: return "extrajudicial"
    if "judicial" in t: return "judicial"
    if "direta" in t: return "venda_direta"
    return "outro"


def parse_card(card):
    a = card.select_one("a.card-title")
    if not a: return None
    url = a["href"]
    m = re.search(r"-(\d+)/?$", url)
    if not m: return None
    item = {
        "id": f"{FONTE}:{m.group(1)}",
        "fonte": FONTE,
        "url": BASE + url if url.startswith("/") else url,
        "titulo": a.get_text(" ", strip=True),
        "uf": "SP",
    }
    price = card.select_one(".card-price")
    item["_valor_atual"] = money(price.get_text()) if price else None
    info = card.select_one(".card-info .text-uppercase")
    item["modalidade"] = modalidade(info.get_text() if info else "")
    if item["modalidade"] == "outro" and card.select_one(".card-label-tag-direct-sale"):
        item["modalidade"] = "venda_direta"
    loc = card.select_one(".card-locality")
    if loc:
        item["cidade"] = city(loc.get_text(strip=True).split(",")[0])
    st = card.select_one(".card-status")
    item["_status"] = st.get_text(" ", strip=True) if st else ""
    item["_status_open"] = bool(st and "open" in (st.get("class") or []))
    # praças
    pracas = []
    for row in card.select(".card-date-row"):
        label = row.select_one(".card-instance-label")
        lis = [li.get_text(" ", strip=True) for li in row.select(".card-instance-date li")]
        lt = label.get_text() if label else ""
        n = re.search(r"(\d)", lt)
        pracas.append({
            "n": int(n.group(1)) if n else (1 if "nica" in lt.lower() else None),
            "inicio": parse_dt(lis[0]) if len(lis) > 0 else None,
            "fim": parse_dt(lis[1]) if len(lis) > 1 else None,
            "valor": money(lis[2]) if len(lis) > 2 else None,
        })
    item["_pracas"] = pracas
    return item


def pick_praca(pracas):
    now = dt.datetime.now()
    for p in pracas:
        if p["fim"] and p["fim"] >= now: return p
    return pracas[-1] if pracas else None


def section_text(soup, title):
    h = soup.find("h2", class_="section-title", string=re.compile(title))
    if not h: return ""
    parts = []
    for sib in h.find_next_siblings():
        if sib.name == "h2": break
        parts.append(sib.get_text("\n", strip=True))
    return "\n".join(p for p in parts if p).strip()


def parse_detail(html, item):
    s = BeautifulSoup(html, "html.parser")
    if item.get("modalidade") == "outro":
        pt = s.select_one(".product-info .product-card-type")
        if pt: item["modalidade"] = modalidade(pt.get_text())
        elif s.select_one(".card-label-tag-direct-sale"): item["modalidade"] = "venda_direta"
    # valores
    for d in s.select(".product-detail"):
        t = d.get_text(" ", strip=True)
        if t.startswith("Valor de avalia"):
            item["avaliacao"] = money(t.split("R$", 1)[-1]) if "R$" in t else None
        elif t.startswith("Valor atual") or t.startswith("Valor inicial") or t.startswith("Lance"):
            v = money(t.split("R$", 1)[-1]) if "R$" in t else None
            if v: item["_valor_atual"] = v
    desc = section_text(s, "Descrição do lote")
    if desc: item["descricao"] = desc
    loc = section_text(s, "Localização")
    loc = loc.split("\n")[0] if loc else ""
    if loc:
        parts = [p.strip() for p in loc.split(",")]
        # "Rua X, 110, Bairro, Cidade, SP"
        if len(parts) >= 4:
            item["endereco"] = ", ".join(parts[:-3])
            item["bairro"] = parts[-3]
            if not item.get("cidade"): item["cidade"] = city(parts[-2])
        elif len(parts) >= 2:
            item["endereco"] = ", ".join(parts[:-2]) or parts[0]
    # documentos
    for a in s.select(".documents a"):
        label = a.get_text(" ", strip=True).lower()
        href = a.get("href") or ""
        if a.get("data-url"):
            try:
                href = base64.b64decode(a["data-url"]).decode()
            except Exception:
                href = ""
        if href.startswith("//"): href = "https:" + href
        elif href.startswith("/"): href = BASE + href
        if not href or href == "#": continue
        if "edital" in label and "edital_url" not in item: item["edital_url"] = href
        elif "matr" in label and "matricula_url" not in item: item["matricula_url"] = href
    fotos = []
    for a in s.select(".product-gallery a.rsImg"):
        h = a.get("data-rsbigimg") or a.get("href")
        if h and h not in fotos: fotos.append(h)
    if fotos: item["fotos"] = fotos
    # praça única (extrajudicial / venda) quando o card não trouxe praças
    if not item["_pracas"]:
        pi = s.select_one(".product-instance")
        if pi:
            t = pi.get_text(" ", strip=True)
            item["data_fim"] = iso(parse_dt(t))
            ini = s.find(string=re.compile("Início do leilão"))
            if ini:
                item["data_leilao"] = iso(parse_dt(ini.find_parent().get_text(" ", strip=True)))
    return item


def area(s):
    """'1.452' -> 1452 ; '192,50' -> 192.5 ; '5.000,00' -> 5000"""
    s = (s or "").strip().rstrip(".")
    if "," not in s: s = s.replace(".", "")
    return money(s)


def enrich_text(item):
    texto = (item.get("titulo") or "") + "\n" + (item.get("descricao") or "")
    t = texto.lower()
    item.update(flags(texto))
    if re.search(r"desocupad", t): item["ocupado"] = False
    elif re.search(r"\bocupad", t): item["ocupado"] = True
    else: item["ocupado"] = None
    m = re.search(r"matr[ií]cula\D{0,25}?n?[ºo°\.]?\s*([\d\.]{3,})", t)
    if m: item["matricula"] = m.group(1).rstrip(".")
    num = r"([\d\.]+(?:,\d+)?)\s*m"
    m = re.search(r"\ba\.?\s?t\.?:?\s*" + num, t) or re.search(r"(?:área (?:total|do terreno|de terreno)[^\d]{0,15})" + num, t)
    if m: item["area_terreno_m2"] = area(m.group(1))
    m = re.search(r"\ba\.?\s?c\.?:?\s*" + num, t) or re.search(r"(?:área (?:útil|privativa|construída)[^\d]{0,15})" + num, t)
    if m: item["area_privativa_m2"] = area(m.group(1))
    if "area_terreno_m2" not in item and "area_privativa_m2" not in item:
        m = re.search(num, item.get("titulo", "").lower())
        if m:
            k = "area_terreno_m2" if item.get("tipo") in ("terreno", "rural") else "area_privativa_m2"
            item[k] = area(m.group(1))
    m = re.search(r"(\d+)\s*(?:quartos|dorm)", t)
    if m: item["quartos"] = int(m.group(1))
    m = re.search(r"(\d+)\s*vaga", t)
    if m: item["vagas"] = int(m.group(1))
    return item


def collect():
    items, seen = [], set()
    page, last = 1, 1
    while page <= last:
        html = get(f"{BASE}/imoveis/sp?pagina={page}")
        if not html:
            print(f"[{FONTE}] falha página {page}, parando"); break
        s = BeautifulSoup(html, "html.parser")
        for a in s.select(".pagination a[href]"):
            m = re.search(r"pagina=(\d+)", a["href"])
            if m: last = max(last, int(m.group(1)))
        novos = 0
        for card in s.select(".card-body"):
            it = parse_card(card)
            if not it or it["id"] in seen: continue
            seen.add(it["id"]); novos += 1
            items.append(it)
        print(f"[{FONTE}] página {page}/{last}: {novos} lotes")
        if novos == 0: break
        page += 1
        time.sleep(0.5)

    out = []
    for it in items:
        if not it["_status_open"] and re.search(r"encerrad|vendid|suspens|cancelad|finaliz", it["_status"].lower()):
            continue
        html = get(it["url"])
        if html:
            try: parse_detail(html, it)
            except Exception as e: print(f"[{FONTE}] erro detalhe {it['url']}: {e}")
        time.sleep(0.3)
        p = pick_praca(it["_pracas"])
        if p:
            it["praca"] = p["n"]
            it["data_leilao"] = iso(p["inicio"])
            it["data_fim"] = iso(p["fim"])
            it["lance_minimo"] = p["valor"] or it.get("_valor_atual")
        else:
            it["lance_minimo"] = it.get("_valor_atual")
        if not it.get("avaliacao"):
            it["avaliacao"] = it["_pracas"][0]["valor"] if it["_pracas"] and it["_pracas"][0]["valor"] else it.get("lance_minimo")
        if not it.get("lance_minimo") or not it.get("avaliacao"):
            print(f"[{FONTE}] sem valores, pulando {it['url']}"); continue
        it["desagio_pct"] = desagio(it["avaliacao"], it["lance_minimo"])
        it["tipo"] = tipo(it["titulo"] + " " + it["url"].split("/imoveis/")[-1].split("/")[0])
        it.setdefault("cidade", "")
        enrich_text(it)
        it["coletado_em"] = now_iso()
        for k in [k for k in it if k.startswith("_")]: del it[k]
        out.append(it)
    return out


if __name__ == "__main__":
    save_raw(FONTE, collect())
