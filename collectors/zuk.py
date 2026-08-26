"""Coletor Portal Zuk (www.portalzuk.com.br), imóveis em leilão no estado de SP.

Método: HTML + bs4 (Laravel/Blade; não há API JSON pública de listagem).
  Listagem inicial: GET https://www.portalzuk.com.br/leilao-de-imoveis/u/todos-imoveis/sp  (30 cards)
  Paginação:        POST https://www.portalzuk.com.br/leilao-de-imoveis/mais  ("carregar mais", 30 por vez)
                    campos: limit (qtd já carregada), count_imovel_zuk, path, order=data_leilao
                    (única ordenação estável para paginar; "relevancia" embaralha e repete lotes),
                    div_parceiro_count, _token (CSRF do form + cookie de sessão).
  Detalhe:          página do imóvel (descrição, matrícula, processo, ocupação, edital, fotos).

Cada lote exige 1 request de detalhe (2 threads, pausa curta). O Cloudflare devolve 429
("Just a moment") se apressar: 2,5s entre páginas e backoff de 6s/12s/18s no 429.

Limitações:
- Zuk não publica "valor de avaliação" na página; avaliacao = valor do 1º leilão
  (nos judiciais é a avaliação; nos extrajudiciais é o valor de 1ª praça do credor).
  Se o texto trouxer "avaliação R$ X" usa-se esse valor.
- lance_minimo = valor da praça vigente (a primeira sem tachado no card).
"""
import re, sys, os, time
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bs4 import BeautifulSoup
from common import session, money, city, tipo, desagio, flags, now_iso, save_raw

BASE = "https://www.portalzuk.com.br"
LIST = BASE + "/leilao-de-imoveis/u/todos-imoveis/sp"
MORE = BASE + "/leilao-de-imoveis/mais"
THREADS = 2
MAX = int(os.environ.get("GARIMPO_MAX", "0") or 0)

def _req(s, method, url, tries=3, **kw):
    for i in range(tries):
        try:
            r = s.request(method, url, timeout=40, **kw)
            if r.status_code == 200:
                return r.text
            print(f"[zuk] HTTP {r.status_code} {url}", file=sys.stderr)
            if r.status_code == 429:
                time.sleep(6 * (i + 1)); continue
        except Exception as e:
            print(f"[zuk] erro {e} {url}", file=sys.stderr)
        time.sleep(1.5 * (i + 1))
    return None

def _txt(e):
    return re.sub(r"\s+", " ", e.get_text(" ", strip=True)) if e else ""

def _date(t):
    m = re.search(r"(\d{2})/(\d{2})/(\d{2,4})", t or "")
    if not m: return None
    y = m.group(3); y = ("20" + y) if len(y) == 2 else y
    return f"{y}-{m.group(2)}-{m.group(1)}"

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

def _parse_card(c):
    a = c.select_one(".card-property-image-wrapper a[href*='/imovel/']") or c.select_one("a[href*='/imovel/']")
    if not a: return None
    url = a["href"]
    star = c.select_one(".card-property-favorite[id]")
    sid = star["id"] if star else url.rsplit("-", 1)[-1]
    addr = c.select_one(".card-property-address")
    cid, uf, bairro, rua = None, None, None, None
    if addr:
        spans = addr.find_all("span", recursive=False)
        if spans:
            t0 = _txt(spans[0])
            m = re.match(r"(.+?)\s*/\s*([A-Z]{2})\s*(?:-\s*(.+))?$", t0)
            if m: cid, uf, bairro = m.group(1), m.group(2), (m.group(3) or "").strip() or None
        if len(spans) > 1: rua = _txt(spans[1])
    pracas = []
    for li in c.select("ul.card-property-prices li.card-property-price"):
        lab = _txt(li.select_one(".card-property-price-label"))
        if "leil" not in lab.lower() and "praça" not in lab.lower() and "venda" not in lab.lower(): continue
        val_el = li.select_one(".card-property-price-value")
        val = money(re.sub(r"\s*\d+\s*$", "", _txt(val_el).replace("R$", "")).strip()) if val_el else None
        # percentual de desconto vem dentro do value; pega só o primeiro número monetário
        mv = re.search(r"[\d\.]+,\d{2}", _txt(val_el)) if val_el else None
        if mv: val = money(mv.group(0))
        struck = bool(li.select_one("[style*='line-through']")) or "line-through" in (li.get("style") or "")
        pracas.append({"label": lab, "valor": val, "data": _date(_txt(li.select_one(".card-property-price-data"))), "passada": struck})
    area = None
    for inf in c.select(".card-property-info-label"):
        t = _txt(inf)
        if "m²" in t or "m2" in t:
            area = money(re.sub(r"m².*|m2.*", "", t)); break
    return {"url": url, "id_fonte": sid, "titulo": a.get("title") or _txt(c.select_one(".card-property-price-lote")),
            "tipo_txt": _txt(c.select_one(".card-property-price-lote")), "cidade": cid, "uf": uf, "bairro": bairro,
            "endereco": rua, "pracas": pracas, "area": area, "parceiro": c.get("data-parceiro")}

def _list_all(s):
    h = _req(s, "GET", LIST)
    if not h: return []
    sp = BeautifulSoup(h, "html.parser")
    tok = sp.select_one("input[name=_token]")
    tok = tok["value"] if tok else None
    m = re.search(r"_clo\s*=\s*Number\(\"(\d+)\"\)", h)
    total = int(m.group(1)) if m else None
    cards = [x for x in (_parse_card(c) for c in sp.select(".card_lotes_div")) if x]
    print(f"[zuk] listagem inicial: {len(cards)} cards (total anunciado {total})", file=sys.stderr)
    seen = set(c["url"] for c in cards)
    while tok:
        if total and len(cards) >= total: break
        n_zuk = sum(1 for c in cards if c.get("parceiro") in (None, "0"))
        data = [("limit", len(cards)), ("count_imovel_zuk", n_zuk), ("path", LIST), ("order", "data_leilao"),
                ("div_parceiro_count", 0), ("_token", tok)]
        h = _req(s, "POST", MORE, data=data, headers={"X-Requested-With": "XMLHttpRequest", "Referer": LIST, "X-CSRF-TOKEN": tok})
        if not h: break
        new = [x for x in (_parse_card(c) for c in BeautifulSoup(h, "html.parser").select(".card_lotes_div")) if x and x["url"] not in seen]
        if not new: break
        for c in new: seen.add(c["url"])
        cards.extend(new)
        print(f"[zuk] +{len(new)} -> {len(cards)}", file=sys.stderr)
        time.sleep(2.5)
    return cards

def _detail(s, card):
    h = _req(s, "GET", card["url"])
    time.sleep(0.6)
    d = {}
    if not h: return d
    sp = BeautifulSoup(h, "html.parser")
    info = sp.select_one(".property-info-text")
    d["descricao"] = re.sub(r"\n\s*\n+", "\n", info.get_text("\n", strip=True)) if info else ""
    obs = sp.find(string=re.compile(r"^\s*Observa[çc][õo]es\s*$"))
    if obs:
        blk = obs.find_parent(["div", "section"])
        if blk: d["observacoes"] = re.sub(r"\n\s*\n+", "\n", blk.get_text("\n", strip=True))[:4000]
    mat = sp.select_one("#itens_matricula")
    d["matricula_txt"] = _txt(mat)
    proc = sp.select_one("#itens_processo")
    d["processo"] = _txt(proc)
    st = _txt(sp.select_one(".property-status-title")).lower()
    d["ocupado"] = True if "ocupado" in st and "desocupado" not in st else (False if "desocupado" in st else None)
    for a in sp.select("a[href*='documentacaoleilao'], a[href$='.pdf']"):
        lab = _txt(a).lower()
        href = a["href"]
        if "edital" in lab and "edital_url" not in d: d["edital_url"] = href
        elif "matr" in lab and "matricula_url" not in d: d["matricula_url"] = href
        elif "laudo" in lab or "avalia" in lab: d.setdefault("laudo_url", href)
    if "edital_url" not in d:
        a = sp.select_one("a[href*='documentacaoleilao']")
        if a: d["edital_url"] = a["href"]
    fotos, seen = [], set()
    for im in sp.select("img"):
        src = im.get("src") or im.get("data-src") or ""
        if "imagens.portalzuk.com.br/detalhe/" in src and src not in seen:
            seen.add(src); fotos.append(src)
    d["fotos"] = fotos
    body = sp.get_text(" ", strip=True)
    mv = re.search(r"(?i)avalia[çc][ãa]o[^R$]{0,40}R\$\s*([\d\.]+,\d{2})", body)
    if mv: d["avaliacao_txt"] = money(mv.group(1))
    d["venda_direta"] = bool(re.search(r"(?i)venda direta", body[:20000]))
    mpg = re.search(r"(?is)Formas de pagamento.{0,400}", body)
    d["pagamento"] = mpg.group(0)[:400] if mpg else ""
    return d

def _build(card, d):
    pr = card["pracas"]
    vig = [p for p in pr if not p["passada"] and p["valor"]] or [p for p in pr if p["valor"]]
    if not vig: return None
    lance, data = vig[0]["valor"], vig[0]["data"]
    praca = None
    mp = re.search(r"(\d)", vig[0]["label"])
    if mp: praca = int(mp.group(1))
    first = [p for p in pr if p["valor"]][0]
    aval = d.get("avaliacao_txt") or first["valor"] or lance
    if aval < lance: aval = lance
    desc = (d.get("descricao") or "")
    full = desc + "\n" + (d.get("observacoes") or "")
    titulo = card["titulo"] or ""
    if d.get("processo") or "tribunal" in titulo.lower() or "vara" in titulo.lower():
        modalidade = "judicial"
    elif d.get("venda_direta") or "venda direta" in (vig[0]["label"] or "").lower():
        modalidade = "venda_direta"
    else:
        modalidade = "extrajudicial"
    mt = d.get("matricula_txt") or ""
    mm = re.match(r"\s*([\d\.\-/]+)", mt)
    cart = re.search(r"do\s+(\d+[ºo°]?\s*(?:CRI|Cart[óo]rio|Of[ií]cio)[^\-\n]{0,50})", mt)
    fl = flags(titulo + "\n" + full)
    deb = _debitos(full)
    pag = (d.get("pagamento") or "").lower()
    tt = tipo(card["tipo_txt"] or titulo)
    if tt == "outro": tt = tipo(titulo)
    ocup = d.get("ocupado")
    if ocup is None:
        low = full.lower()
        if re.search(r"\bdesocupad", low): ocup = False
        elif re.search(r"\bocupad", low): ocup = True
    item = {
        "id": f"zuk:{card['id_fonte']}",
        "fonte": "zuk",
        "url": card["url"],
        "tipo": tt,
        "titulo": re.sub(r"\s*\|\s*Z\d+.*$", "", titulo)[:200],
        "endereco": card.get("endereco"),
        "bairro": card.get("bairro"),
        "cidade": city(card.get("cidade") or ""),
        "uf": "SP",
        "area_privativa_m2": card.get("area") if tt != "terreno" else None,
        "area_terreno_m2": card.get("area") if tt == "terreno" else None,
        "avaliacao": aval,
        "lance_minimo": lance,
        "desagio_pct": desagio(aval, lance),
        "modalidade": modalidade,
        "praca": praca,
        "data_leilao": data,
        "data_fim": data,
        "ocupado": ocup,
        "aceita_financiamento": True if "financ" in pag else (False if "vista" in pag and "parcel" not in pag else None),
        "aceita_fgts": True if "fgts" in pag else None,
        "debitos_regra": deb,
        "debitos_por_conta_comprador": (True if re.search(r"(arrematante|comprador)", deb, re.I) and not re.search(r"(vendedor|comitente|quitad)", deb, re.I) else (False if re.search(r"(vendedor|comitente|quitad)", deb, re.I) else None)) if deb else None,
        "direitos_fiduciante": fl["direitos_fiduciante"],
        "fracao_ideal": fl["fracao_ideal"],
        "matricula": mm.group(1) if mm else None,
        "cartorio": cart.group(1).strip() if cart else None,
        "edital_url": d.get("edital_url"),
        "matricula_url": d.get("matricula_url"),
        "fotos": d.get("fotos") or [],
        "descricao": full[:6000],
        "coletado_em": now_iso(),
    }
    return {k: v for k, v in item.items() if v is not None or k in ("praca", "ocupado", "data_leilao")}

def collect():
    s = session()
    cards = _list_all(s)
    cards = [c for c in cards if (c.get("uf") or "SP") == "SP"]
    if MAX: cards = cards[:MAX]
    print(f"[zuk] {len(cards)} lotes em SP; buscando detalhes...", file=sys.stderr)
    items, seen = [], set()
    def work(c):
        try:
            return _build(c, _detail(s, c))
        except Exception as e:
            print(f"[zuk] falha {c['url']}: {e}", file=sys.stderr)
            return None
    with ThreadPoolExecutor(THREADS) as ex:
        for i, it in enumerate(ex.map(work, cards), 1):
            if it and it["id"] not in seen:
                seen.add(it["id"]); items.append(it)
            if i % 50 == 0: print(f"[zuk] detalhes {i}/{len(cards)}", file=sys.stderr)
    return items

if __name__ == "__main__":
    save_raw("zuk", collect())
