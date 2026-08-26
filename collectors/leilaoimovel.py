"""Coletor Leilão Imóvel (agregador) para o estado de SP.

Fonte: https://www.leilaoimovel.com.br

Método (HTML, não há API JSON pública para a listagem):
- /getAllCities (JSON) devolve todas as cidades com a quantidade de lotes ativos
  por cidade; filtramos state == "SP" e qty > 0.
- Listagem por cidade: /leilao-de-imovel/<cidade>-sp?pag=N (19 cards por página).
  O site limita a paginação a 50 páginas (950 lotes) por consulta; para cidades
  maiores (São Paulo tem > 2.000) fatiamos por faixa de preço com
  preco_min/preco_max até cada fatia caber no limite.
- Cada card traz id, url, título, endereço, lance, avaliação e data de
  encerramento. Descrição, leiloeiro, praças, áreas, matrícula, edital, fotos e
  situação (ocupado) só existem na página de detalhe /imovel/<uf>/<cidade>/<slug>,
  que é aberta para cada lote (sequencial, sleep 0.3s, backoff em 429, falha tolerada;
  com falha o item fica só com os dados do card).

Bloqueio: Cloudflare desafia (403 "Just a moment") toda conexão HTTP/2 e
qualquer cliente Python (requests/urllib) mesmo com headers de browser: o
bloqueio é por fingerprint TLS. O curl do macOS (SecureTransport) com --http1.1
passa normalmente, então o transporte usa requests primeiro e cai para
subprocess curl --http1.1 ao detectar o desafio.

Variáveis de ambiente para teste:
  LIMIT_PAGES=N   limita o total de páginas de listagem lidas.
  SKIP_DETAILS=1  não abre páginas de detalhe.
  DETAIL_WORKERS  threads para detalhe (padrão 1; o site devolve 429 com paralelismo).
"""
import json
import os
import re
import subprocess
import sys
import time
import datetime as dt
from concurrent.futures import ThreadPoolExecutor

from bs4 import BeautifulSoup

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import session, money, city, tipo, desagio, flags, now_iso, save_raw, UA  # noqa: E402

BASE = "https://www.leilaoimovel.com.br"
FONTE = "leilaoimovel"
PAGE_SLEEP = 0.5
DETAIL_SLEEP = 0.3
MAX_PAGES = 50          # limite do site por consulta
PER_PAGE = 19
QUERY_CAP = MAX_PAGES * PER_PAGE
LIMIT_PAGES = int(os.environ.get("LIMIT_PAGES", "0") or 0)
SKIP_DETAILS = os.environ.get("SKIP_DETAILS", "") not in ("", "0")
DETAIL_WORKERS = int(os.environ.get("DETAIL_WORKERS", "1") or 1)

_session = session()
_use_curl = False
_extra_sleep = 0.0      # sobe a cada 429, desce devagar quando o site responde bem
_ok_streak = 0


def _is_challenge(status, text):
    return status == 403 or "Just a moment" in text[:600]


def _curl(url):
    cmd = ["curl", "-s", "--http1.1", "--compressed", "-m", "40", "-A", UA,
           "-H", "Accept-Language: pt-BR,pt;q=0.9", "-w", "\n%{http_code}", url]
    out = subprocess.run(cmd, capture_output=True).stdout.decode("utf-8", "replace")
    body, _, code = out.rpartition("\n")
    return (int(code) if code.strip().isdigit() else 0), body


def fetch(url, retries=4):
    """GET com retry; alterna para curl --http1.1 se o Cloudflare desafiar."""
    global _use_curl, _extra_sleep, _ok_streak
    last = ""
    for i in range(retries):
        try:
            if not _use_curl:
                r = _session.get(url, timeout=40)
                if not _is_challenge(r.status_code, r.text):
                    return r.text
                _use_curl = True
                print("[leilaoimovel] desafio Cloudflare via requests; usando curl --http1.1")
            code, body = _curl(url)
            if code == 200 and not _is_challenge(code, body):
                _ok_streak += 1
                if _ok_streak >= 100 and _extra_sleep > 0:
                    _extra_sleep = max(0.0, _extra_sleep - 0.25)
                    _ok_streak = 0
                return body
            last = "http %s" % code
            if code == 429:
                _extra_sleep = min(4.0, _extra_sleep + 0.5)
                _ok_streak = 0
                wait = 15.0 * (i + 1)
                print("[leilaoimovel] 429 rate limit, aguardando %.0fs (sleep extra %.1fs)" % (wait, _extra_sleep))
                time.sleep(wait)
                continue
        except Exception as e:  # noqa: BLE001
            last = repr(e)
        time.sleep(1.0 + i)
    print("[leilaoimovel] falha %s: %s" % (url, last))
    return None


# ---------- helpers ----------

def _clean(s):
    return re.sub(r"\s+", " ", s or "").strip()


def _date(s):
    m = re.search(r"(\d{2})/(\d{2})/(\d{4})", s or "")
    return "%s-%s-%s" % (m.group(3), m.group(2), m.group(1)) if m else None


def _area(s):
    m = re.search(r"([\d.]+,\d+|\d+)\s*m", s or "")
    return money(m.group(1)) if m else None


def _modalidade(texto, href=""):
    t = (texto or "").lower() + " " + (href or "").lower()
    if "judicial" in t and "extra" not in t:
        return "judicial"
    if "extrajudicial" in t:
        return "extrajudicial"
    if "sfi" in t:
        return "leilao_sfi"
    if "licitacao" in t or "licitação" in t:
        return "licitacao_aberta"
    if "online" in t:
        return "venda_online"
    if "venda-direta" in t or "venda direta" in t or "compra direta" in t or "direta" in t:
        return "venda_direta"
    return "outro"


# ---------- cidades ----------

def cities_sp():
    txt = fetch(BASE + "/getAllCities")
    if not txt:
        return []
    try:
        locs = json.loads(txt).get("locations", [])
    except ValueError:
        print("[leilaoimovel] getAllCities não devolveu JSON")
        return []
    out = []
    for c in locs:
        if c.get("state") != "SP" or not c.get("qty"):
            continue
        name = re.sub(r"/SP.*$", "", c.get("name", "")).strip()
        out.append({"slug": c["slug"], "nome": name, "qty": int(c["qty"])})
    out.sort(key=lambda c: -c["qty"])
    return out


# ---------- listagem ----------

def parse_cards(html, cidade_nome):
    soup = BeautifulSoup(html, "html.parser")
    items = []
    for box in soup.select("div.place-box"):
        a = box.select_one('a[href*="/imovel/"]')
        if not a:
            continue
        href = a.get("href", "")
        url = href if href.startswith("http") else BASE + href
        m = re.search(r"tgonselected(\d+)", a.get("onclick", "") or "")
        if not m:
            m = re.search(r"imovel-(\d+)(?:-|$)", href) or re.search(r"-(\d{5,})(?:-\d+)?-venda-direta", href)
        if not m:
            continue
        pid = m.group(1)
        addr = box.select_one(".address")
        titulo = _clean(addr.b.get_text(" ")) if addr and addr.b else _clean(a.get("title", ""))
        endereco = _clean(addr.span.get_text(" ")) if addr and addr.span else None
        lance = money(_clean(box.select_one(".discount-price").get_text())) if box.select_one(".discount-price") else None
        aval = money(_clean(box.select_one(".last-price").get_text())) if box.select_one(".last-price") else None
        datas = " ".join(_clean(s.get_text(" ")) for s in box.select(".tag span, .infos span"))
        cats = [(_clean(c.get_text()), c.get("href", "")) for c in box.select(".categories a")]
        modal = "outro"
        for txt, h in cats:
            mm = _modalidade(txt, h)
            if mm != "outro":
                modal = mm
                break
        if modal == "outro":
            modal = _modalidade("", href)
        img = box.select_one("img")
        foto = img.get("src") if img else None
        items.append({
            "id": "%s:%s" % (FONTE, pid),
            "fonte": FONTE,
            "url": url,
            "tipo": tipo(titulo),
            "titulo": titulo,
            "endereco": endereco,
            "cidade": city(cidade_nome),
            "uf": "SP",
            "avaliacao": aval,
            "lance_minimo": lance,
            "modalidade": modal,
            "data_leilao": _date(datas),
            "fotos": [foto] if foto else [],
            "_tags": [t for t, _ in cats],
        })
    return items


def _count(html):
    m = re.search(r"(\d+)\s+Imóveis Encontrados", html)
    return int(m.group(1)) if m else None


_pages_read = 0


def list_query(url_base, cidade_nome, expected=None):
    """Percorre ?pag=1..N de uma consulta. Devolve (items, total_informado)."""
    global _pages_read
    items, total = [], expected
    sep = "&" if "?" in url_base else "?"
    for pag in range(1, MAX_PAGES + 1):
        if LIMIT_PAGES and _pages_read >= LIMIT_PAGES:
            break
        html = fetch(url_base if pag == 1 else "%s%spag=%d" % (url_base, sep, pag))
        _pages_read += 1
        if not html:
            time.sleep(PAGE_SLEEP)
            continue
        if pag == 1:
            total = _count(html) if _count(html) is not None else total
        cards = parse_cards(html, cidade_nome)
        items.extend(cards)
        if len(cards) < PER_PAGE or (total is not None and len(items) >= total):
            break
        time.sleep(PAGE_SLEEP)
    return items, total


def list_city(c):
    url = BASE + c["slug"]
    if c["qty"] <= QUERY_CAP:
        items, _ = list_query(url, c["nome"], c["qty"])
        return items
    # cidade acima do limite: fatia por faixa de preço (recursivo)
    print("[leilaoimovel] %s tem %d lotes, fatiando por preço" % (c["nome"], c["qty"]))
    out, seen = [], set()

    def add(items):
        for it in items:
            if it["id"] not in seen:
                seen.add(it["id"])
                out.append(it)

    def band(lo, hi):
        q = "%s?preco_min=%d&preco_max=%d" % (url, lo, hi)
        html = fetch(q)
        _bump()
        if not html:
            return
        n = _count(html) or 0
        if n <= QUERY_CAP or hi - lo <= 1000:
            first = parse_cards(html, c["nome"])
            add(first)
            if len(first) >= PER_PAGE and n > PER_PAGE:
                time.sleep(PAGE_SLEEP)
                rest, _ = list_query(q, c["nome"], n)
                add(rest)
            return
        mid = (lo + hi) // 2
        time.sleep(PAGE_SLEEP)
        band(lo, mid)
        band(mid + 1, hi)

    band(0, 100_000_000)
    return out


def _bump():
    global _pages_read
    _pages_read += 1


# ---------- detalhe ----------

def parse_detail(html, item):
    soup = BeautifulSoup(html, "html.parser")
    d = {}
    ap = soup.select_one(".appraised h2")
    if ap:
        d["avaliacao"] = money(_clean(ap.get_text()))
    vl = soup.select_one(".value h2.discount-price") or soup.select_one(".value h2")
    if vl:
        d["lance_minimo"] = money(_clean(vl.get_text()))

    # praças
    pracas = []
    for blk in soup.select(".bids .col-12"):
        sp, p, h3 = blk.select_one("span"), blk.select_one("p"), blk.select_one("h3")
        if not sp:
            continue
        lab = _clean(sp.get_text())
        mn = re.search(r"(\d)\s*[°ºª]", lab)
        pracas.append({
            "n": int(mn.group(1)) if mn else None,
            "data": _date(p.get_text() if p else ""),
            "valor": money(_clean(h3.get_text())) if h3 else None,
            "label": lab,
        })
    hoje = dt.date.today().isoformat()
    vig = None
    for pr in pracas:
        if pr["data"] and pr["data"] >= hoje:
            vig = pr
            break
    if vig is None and pracas:
        vig = pracas[-1]
    if vig:
        if vig["n"]:
            d["praca"] = vig["n"]
        if vig["data"]:
            d["data_leilao"] = vig["data"]
        if vig["valor"]:
            d["lance_minimo"] = vig["valor"]
        if len(pracas) >= 2 and pracas[-1]["data"]:
            d["data_fim"] = pracas[-1]["data"]
    else:
        txt_enc = soup.find(string=re.compile(r"Encerra em"))
        if txt_enc:
            par = txt_enc.parent.get_text(" ") if txt_enc.parent else str(txt_enc)
            dd = _date(par)
            if dd:
                d["data_leilao"] = dd

    # detalhes (áreas, situação)
    for det in soup.select(".imovel-details .detail"):
        lab = _clean(det.p.get_text()) if det.p else ""
        val = _clean(det.select_one(".icon span").get_text()) if det.select_one(".icon span") else ""
        ll = lab.lower()
        if "útil" in ll or "util" in ll or "privativa" in ll or "construída" in ll:
            d["area_privativa_m2"] = _area(val)
        elif "terreno" in ll:
            d["area_terreno_m2"] = _area(val)
        elif "total" in ll:
            d.setdefault("area_privativa_m2", _area(val))
        elif "situa" in ll:
            v = val.lower()
            d["ocupado"] = True if "ocupado" in v and "desocupado" not in v else (False if "desocupado" in v else None)
        elif "quarto" in ll or "dormit" in ll:
            m = re.search(r"\d+", val)
            if m:
                d["quartos"] = int(m.group())
        elif "vaga" in ll:
            m = re.search(r"\d+", val)
            if m:
                d["vagas"] = int(m.group())

    # documentos
    for a in soup.select(".documments a.documment"):
        t = _clean(a.get_text()).lower()
        if "matr" in t:
            d["matricula_url"] = a.get("href")
        elif "edital" in t:
            d["edital_url"] = a.get("href")

    # "Mais sobre o Imóvel": pares <b>Label:</b> valor
    more = soup.select_one(".more")
    if more:
        for div in more.find_all("div", recursive=False):
            b = div.find("b")
            if not b:
                continue
            lab = _clean(b.get_text()).rstrip(":").lower()
            val = _clean(div.get_text(" ").replace(b.get_text(), "", 1))
            links = div.select("a")
            if lab.startswith("tipo"):
                for a in links:
                    if "/leilao/" in (a.get("href") or ""):
                        mm = _modalidade(_clean(a.get_text()), a.get("href"))
                        if mm != "outro":
                            d["modalidade"] = mm
                tp = links[0].get_text() if links else val
                d["tipo"] = tipo(tp)
            elif lab.startswith("leiloeiro"):
                nome = re.sub(r"\(.*?\)", "", val).strip(" /")
                if nome:
                    d["leiloeiro"] = nome
            elif lab.startswith("banco"):
                nome = val.strip(" /")
                if nome and "leiloeiro" not in d:
                    d["leiloeiro"] = nome
            elif lab.startswith("matr"):
                d["matricula"] = val
            elif lab.startswith("comarca"):
                d["cartorio"] = val
            elif lab.startswith("ofício") or lab.startswith("oficio"):
                if d.get("cartorio"):
                    d["cartorio"] = "%s ofício %s" % (d["cartorio"], val)
            elif lab.startswith("descri"):
                d["descricao"] = val
            elif lab.startswith("localiza"):
                parts = [_clean(a.get_text()).lstrip("/ ") for a in links]
                if len(parts) >= 3 and parts[2]:
                    d["bairro"] = parts[2]

    # condições (financiamento / FGTS / débitos)
    body = soup.select_one("main") or soup.body
    txt = body.get_text("\n") if body else ""
    if re.search(r"NÃO ACEITA Financiamento", txt):
        d["aceita_financiamento"] = False
    elif re.search(r"ACEITA Financiamento", txt):
        d["aceita_financiamento"] = True
    if re.search(r"NÃO ACEITA FGTS", txt):
        d["aceita_fgts"] = False
    elif re.search(r"ACEITA FGTS", txt):
        d["aceita_fgts"] = True
    regras = []
    for m in re.finditer(r"(Condom[ií]nio|Tributos):\s*([^\n]+)", txt):
        regras.append("%s: %s" % (m.group(1), _clean(m.group(2))))
    if regras:
        d["debitos_regra"] = " | ".join(dict.fromkeys(regras))
        d["debitos_por_conta_comprador"] = bool(re.search(r"responsabilidade do comprador", d["debitos_regra"], re.I))
    mcep = re.search(r"CEP:?\s*(\d{5}-?\d{3})", (item.get("endereco") or "") + " " + txt[:3000])
    if mcep:
        d["cep"] = mcep.group(1)

    fotos = []
    for m in re.finditer(r"https://image\.leilaoimovel\.com\.br/images/[^\"'\s]+", html):
        u = m.group(0)
        if u not in fotos:
            fotos.append(u)
    if fotos:
        d["fotos"] = fotos
    return d


def enrich(item):
    html = fetch(item["url"])
    if html:
        try:
            item.update({k: v for k, v in parse_detail(html, item).items() if v is not None})
        except Exception as e:  # noqa: BLE001
            print("[leilaoimovel] erro parse detalhe %s: %r" % (item["url"], e))
    time.sleep(DETAIL_SLEEP + _extra_sleep)
    return item


# ---------- principal ----------

def finalize(item):
    item.pop("_tags", None)
    item["desagio_pct"] = desagio(item.get("avaliacao"), item.get("lance_minimo"))
    item.update(flags((item.get("descricao") or "") + " " + (item.get("titulo") or "")))
    if item.get("avaliacao") is None:
        item["avaliacao"] = 0.0
    if item.get("lance_minimo") is None:
        item["lance_minimo"] = 0.0
    item["coletado_em"] = now_iso()
    return item


def collect():
    cidades = cities_sp()
    if not cidades:
        print("[leilaoimovel] nenhuma cidade (bloqueio ou mudança no site)")
        return []
    total_prev = sum(c["qty"] for c in cidades)
    print("[leilaoimovel] %d cidades em SP, %d lotes previstos" % (len(cidades), total_prev))
    items, seen = [], set()
    for i, c in enumerate(cidades, 1):
        if LIMIT_PAGES and _pages_read >= LIMIT_PAGES:
            break
        try:
            got = list_city(c)
        except Exception as e:  # noqa: BLE001
            print("[leilaoimovel] erro cidade %s: %r" % (c["nome"], e))
            got = []
        novos = 0
        for it in got:
            if it["id"] in seen:
                continue
            seen.add(it["id"])
            items.append(it)
            novos += 1
        if novos != c["qty"]:
            print("[leilaoimovel] %3d/%d %s: %d/%d" % (i, len(cidades), c["nome"], novos, c["qty"]))
        time.sleep(PAGE_SLEEP)
    print("[leilaoimovel] listagem: %d lotes" % len(items))

    if not SKIP_DETAILS and items:
        print("[leilaoimovel] abrindo %d detalhes com %d workers" % (len(items), DETAIL_WORKERS))
        done = 0
        with ThreadPoolExecutor(max_workers=DETAIL_WORKERS) as ex:
            for _ in ex.map(enrich, items):
                done += 1
                if done % 500 == 0:
                    print("[leilaoimovel] detalhes %d/%d" % (done, len(items)))
    return [finalize(it) for it in items]


if __name__ == "__main__":
    save_raw(FONTE, collect())
