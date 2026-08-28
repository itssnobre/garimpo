"""Coletor Biasi Leilões (https://www.biasileiloes.com.br), imóveis no Brasil inteiro.

Método (descoberto lendo /JS/Sale/LotSearchIndex.min.js):
  1. GET /Sale/LotListSearch?uf=XX&start=N&limit=48 iterando as 27 UFs (retorna
     HTML parcial com os cards; o div#leilao-lista-lote traz total/index/limit para
     paginar). Só entram cards com ícone fa-house (imóvel); a UF real sai do
     span.lot-subtitle ("..., Cidade/UF") ou do título ("- Cidade/UF").
     Não exige token antiforgery nem cookie.
  2. GET /sale/detail?id=<lote> para cada card (sleep 0.3s) e extrai título,
     endereço (span.lot-subtitle), praças (h4 com class "expired" = praça passada),
     lance inicial, data (#DataLeilao), fotos (#carousel-photos img), anexos
     (ul.file-list: Edital.pdf / Matrícula.pdf) e o texto do painel de descrição.

Avaliação: nos lotes de 2 praças usa o valor do 1º Leilão; nos lotes de lance
único usa "Valor alvo do Banco para Venda" ou "Avaliação: R$" quando aparece no
texto, senão cai no próprio lance mínimo (deságio 0).
Modalidade: pelo título do leilão (breadcrumb): "venda direta" -> venda_direta,
"judicial/justiça/vara/processo" -> judicial, senão extrajudicial (bancos, AF).
"""
import re
import sys
import time

from bs4 import BeautifulSoup

sys.path.insert(0, __import__("os").path.dirname(__file__))
from common import session, money, city, tipo, desagio, flags, now_iso, save_raw  # noqa: E402

BASE = "https://www.biasileiloes.com.br"
FONTE = "biasi"
PAGE = 48
UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"]
SLEEP_PAGE = 0.5
SLEEP_LOT = 0.3
RETRY = 3


def _get(s, url, params=None):
    last = None
    for i in range(RETRY):
        try:
            r = s.get(url, params=params, timeout=30,
                      headers={"X-Requested-With": "XMLHttpRequest", "Referer": BASE + "/"})
            if r.status_code == 200 and r.text:
                return r.text
            last = "HTTP %s" % r.status_code
        except Exception as e:  # noqa: BLE001
            last = repr(e)
        time.sleep(1.0 * (i + 1))
    print("[biasi] falha %s: %s" % (url, last))
    return None


def _cards(html):
    s = BeautifulSoup(html, "html.parser")
    box = s.select_one("#leilao-lista-lote")
    total = int(box["total"]) if box and box.has_attr("total") else 0
    out = []
    for a in s.select("a.leilao-lote"):
        ico = a.select_one(".container-title i")
        if ico and "fa-house" not in (ico.get("class") or []):
            continue  # veículo/máquina
        lid = a.get("data-id") or re.search(r"id=(\d+)", a.get("href", "") or "").group(1)
        title = a.select_one(".card-title")
        prices = [x.get_text(" ", strip=True) for x in a.select(".price-leiloes span")]
        out.append({
            "id": lid,
            "titulo": title.get_text(" ", strip=True) if title else "",
            "prices": prices,
            "foto": (re.findall(r"url\(([^)]+)", a.select_one(".card-img-cover")["style"])[0]
                     if a.select_one(".card-img-cover") and a.select_one(".card-img-cover").has_attr("style") else None),
        })
    return total, out


def _list_all(s):
    seen, items = set(), []
    for uf in UFS:
        start, total = 0, None
        while total is None or start < total:
            html = _get(s, BASE + "/Sale/LotListSearch",
                        {"uf": uf, "categoria": "", "start": start, "limit": PAGE})
            if not html:
                break
            total, cards = _cards(html)
            if not cards:
                break
            for c in cards:
                if c["id"] not in seen:
                    c["uf_lista"] = uf
                    seen.add(c["id"])
                    items.append(c)
            print("[biasi] %s listagem %d (total fonte %d)" % (uf, len(items), total))
            start += PAGE
            time.sleep(SLEEP_PAGE)
    return items


def _num(s):
    """'600.00 m²' / '146,54 m²' / '1.234,5' -> float"""
    if not s:
        return None
    s = s.strip()
    if re.match(r"^\d+\.\d{1,2}$", s):
        return float(s)
    return money(s)


def _area(txt, kinds):
    for k in kinds:
        m = re.search(k + r"\s*[:\-]?\s*(?:de\s+)?(?:aprox\.?\s*)?([\d\.,]+)\s*m", txt, re.I)
        if m:
            v = _num(m.group(1))
            if v:
                return v
    return None


def _parse_detail(s, card):
    lid = card["id"]
    url = "%s/sale/detail?id=%s" % (BASE, lid)
    html = _get(s, url)
    d = {"id": "%s:%s" % (FONTE, lid), "fonte": FONTE, "url": url,
         "titulo": card["titulo"], "coletado_em": now_iso()}
    if not html:
        return None
    sp = BeautifulSoup(html, "html.parser")

    h1 = sp.select_one("h1.lot-title")
    if h1:
        d["titulo"] = h1.get_text(" ", strip=True)
    titulo = d["titulo"]

    # leilão (breadcrumb) e modalidade
    crumbs = [li.get_text(" ", strip=True).lstrip("> ").strip() for li in sp.select("ol.breadcrumb li")]
    leilao_titulo = crumbs[1] if len(crumbs) >= 2 else ""
    lt = leilao_titulo.lower()
    if "venda direta" in lt:
        d["modalidade"] = "venda_direta"
    elif re.search(r"judicial|justi[cç]a|\bvara\b|processo", lt):
        d["modalidade"] = "judicial"
    else:
        d["modalidade"] = "extrajudicial"

    # endereço: "Rua X, 123, Bairro , Cidade/SP"
    sub = sp.select_one("span.lot-subtitle")
    endereco_full = sub.get_text(" ", strip=True) if sub else ""
    parts = [p.strip() for p in endereco_full.split(",") if p.strip()]
    cid, bairro, uf = None, None, None
    if parts and "/" in parts[-1]:
        cid, uf = parts[-1].rsplit("/", 1)
        uf = uf.strip().upper()
        parts = parts[:-1]
        if parts:
            bairro = parts[-1]
            parts = parts[:-1]
        if parts:
            d["endereco"] = ", ".join(parts)
    if not cid:
        m = re.search(r"-\s*([^-/]+?)/([A-Z]{2})\s*$", titulo)
        if m:
            cid, uf = m.group(1), m.group(2)
    if uf not in UFS:
        m = re.search(r"/([A-Z]{2})\b", titulo + " " + endereco_full)
        uf = m.group(1) if m and m.group(1) in UFS else card.get("uf_lista")
    if uf not in UFS:
        return None
    d["uf"] = uf
    d["cidade"] = city(cid or "")
    if bairro:
        d["bairro"] = bairro

    # praças / datas
    h4s = [(h.get_text(" ", strip=True), "expired" in (h.get("class") or [])) for h in sp.find_all("h4")]
    pracas = [(t, e) for t, e in h4s if re.search(r"leil[ãa]o", t, re.I)]
    praca = None
    if len(pracas) >= 2:
        praca = 2 if pracas[0][1] else 1
    elif len(pracas) == 1:
        praca = 1
    if praca:
        d["praca"] = praca
    dl = sp.select_one("#DataLeilao")
    if dl and dl.get("value"):
        d["data_leilao"] = dl["value"][:10]
    else:
        m = re.search(r"(\d{2})/(\d{2})/(\d{4})", " ".join(t for t, _ in pracas))
        if m:
            d["data_leilao"] = "%s-%s-%s" % (m.group(3), m.group(2), m.group(1))

    # valores
    info = " ".join(x.get_text(" ", strip=True) for x in sp.select(".info-line"))
    m = re.search(r"Lance Inicial\s*-\s*(R\$\s*[\d\.,]+)", info)
    lance = money(m.group(1)) if m else None
    prices = card["prices"]
    p1 = p2 = None
    for i, t in enumerate(prices):
        if t.startswith("1º") and i + 1 < len(prices):
            p1 = money(prices[i + 1])
        if t.startswith("2º") and i + 1 < len(prices):
            p2 = money(prices[i + 1])
    if lance is None:
        lance = p2 if (praca == 2 and p2) else (p1 or (money(prices[-1]) if prices else None))

    # descrição
    panel = sp.select_one("div.panel-body.col-md-6")
    desc = panel.get_text("\n", strip=True) if panel else ""
    alert = " ".join(a.get_text(" ", strip=True) for a in sp.select("div.alert"))
    full = desc + "\n" + alert
    d["descricao"] = desc

    aval = None
    m = re.search(r"(?:Valor alvo do Banco para Venda|Valor de Avalia[çc][ãa]o|Avalia[çc][ãa]o)\s*[:\-]?\s*R\$\s*([\d\.,]+)", full, re.I)
    if m:
        aval = money(m.group(1))
    if not aval and p1 and p2:
        aval = p1
    if not aval:
        m = re.search(r"1[º°]\s*Leil[ãa]o[^R]{0,40}R\$\s*([\d\.,]+)", full)
        if m:
            aval = money(m.group(1))
    if not aval:
        aval = lance
    d["avaliacao"] = aval
    d["lance_minimo"] = lance
    d["desagio_pct"] = desagio(aval, lance)

    # ocupação
    ft = (full + " " + titulo).lower()
    m = re.search(r"status da ocupa[çc][ãa]o:\s*(\w+)", ft)
    if m:
        d["ocupado"] = not m.group(1).startswith("desocup")
    elif re.search(r"desocupad", ft):
        d["ocupado"] = False
    elif re.search(r"\bocupad", ft):
        d["ocupado"] = True
    else:
        d["ocupado"] = None

    # tipo
    m = re.search(r"Tipo do Im[óo]vel:\s*([^\n]+)", desc)
    d["tipo"] = tipo((m.group(1) if m else "") + " " + titulo)

    # áreas
    at = _area(full, [r"[ÁA]rea\s*(?:de\s*)?Terreno", r"m²\s*de\s*[áa]rea\s*terreno", r"[áa]rea\s*total\s*do\s*terreno"])
    if not at:
        m = re.search(r"([\d\.,]+)\s*m²\s*de\s*[áa]rea\s*(?:de\s*)?terreno", full, re.I)
        at = _num(m.group(1)) if m else None
    ap = _area(full, [r"[ÁA]rea\s*Privativa", r"[ÁA]rea\s*Constru[íi]da", r"[ÁA]rea\s*[ÚU]til"])
    if not ap:
        m = re.search(r"([\d\.,]+)\s*m²\s*de\s*[áa]rea\s*(?:privativa|constru[íi]da|[úu]til)", full, re.I)
        ap = _num(m.group(1)) if m else None
    if at:
        d["area_terreno_m2"] = at
    if ap:
        d["area_privativa_m2"] = ap

    # matrícula / cartório
    m = re.search(r"Matr[íi]cula(?:\(s\))?\s*(?:n[º°o]\.?)?\s*[:\-]?\s*([\d\.]{3,})", full, re.I) or \
        re.search(r"matriculad[oa] sob (?:o )?n[º°o]?\.?\s*([\d\.]{3,})", full, re.I)
    if m:
        d["matricula"] = m.group(1).rstrip(".")
    m = re.search(r"Cart[óo]rio de Registro:\s*([^\n]+)", desc) or \
        re.search(r"(\d+[º°]?\s*(?:Oficial de Registro de Im[óo]veis|CRI|Cart[óo]rio de Registro de Im[óo]veis)[^,\.\n]{0,60})", full, re.I)
    if m:
        d["cartorio"] = m.group(1).strip()

    m = re.search(r"Condi[çc][õo]es de Pagamento\s*\n?\s*([^\n]+)", desc)
    if m and re.search(r"financiamento", m.group(1), re.I):
        d["aceita_financiamento"] = True
    m = re.search(r"[^\n]*\bd[ée]bitos?\b[^\n]*", full, re.I)
    if m and len(m.group(0).strip()) > 25:
        d["debitos_regra"] = m.group(0).strip()[:400]
        d["debitos_por_conta_comprador"] = bool(re.search(r"(arrematante|comprador)", m.group(0), re.I)) and \
            not re.search(r"(vendedor|comitente|banco) (arcar|assumir|se responsabiliza)", m.group(0), re.I) or None

    # fotos / anexos
    fotos = [i.get("src") for i in sp.select("#carousel-photos img") if i.get("src")]
    if not fotos and card.get("foto"):
        fotos = [card["foto"]]
    d["fotos"] = fotos
    for a in sp.select("ul.file-list a"):
        name = a.get_text(" ", strip=True).lower()
        href = a.get("href")
        if not href:
            continue
        if "edital" in name and "edital_url" not in d:
            d["edital_url"] = href
        elif "matr" in name and "matricula_url" not in d:
            d["matricula_url"] = href

    d.update(flags(full + " " + titulo))
    return d


def collect():
    s = session()
    cards = _list_all(s)
    print("[biasi] %d lotes (imóveis, Brasil) na listagem" % len(cards))
    out = []
    for i, c in enumerate(cards, 1):
        try:
            d = _parse_detail(s, c)
            if d and d.get("lance_minimo"):
                out.append(d)
            else:
                print("[biasi] lote %s sem dados, pulado" % c["id"])
        except Exception as e:  # noqa: BLE001
            print("[biasi] erro lote %s: %r" % (c["id"], e))
        if i % 20 == 0:
            print("[biasi] detalhes %d/%d" % (i, len(cards)))
        time.sleep(SLEEP_LOT)
    return out


if __name__ == "__main__":
    save_raw("biasi", collect())
