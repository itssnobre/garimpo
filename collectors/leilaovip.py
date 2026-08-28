"""Coletor Leilão VIP (www.leilaovip.com.br), judicial (TJSP, TJRJ, TJPR, TRT...) + extrajudicial
(Banco PAN, Bradesco, Embracon, Cresol...), Brasil inteiro.

Método: HTML + bs4 (ASP.NET Razor Pages com handlers AJAX; precisa de cookie de sessão/canal
e do __RequestVerificationToken do form).
  Agenda:  POST /agenda?handler=pesquisarEventos  (form: Filtro.Segmento=IMÓVEIS, Filtro.CurrentPage=N;
           25 cards/página, paginação « 1 2 3 »). Cards = eventos (/evento/detalhes/<código>);
           eventos judiciais de lote único já trazem valores no card.
  Evento:  GET /evento/detalhes/<código> (form com Filtro.EventoId + token) e
           POST /evento/detalhes/<código>?handler=pesquisar (form + Filtro.CurrentPage) -> cards
           dos anúncios (/evento/anuncio/<slug>-<id>).
  Anúncio: página do lote (.an-desc: 1º/2º Leilão data+valor, Lote, Categoria, Situação;
           .an-details: Status, Tipo de Leilão, Código; .an-cty: Cidade/Estado; .an-obs: descrição;
           .an-document: edital/matrícula PDFs).

Cada anúncio exige 1 request de detalhe (3 threads, pausa curta).

Limitações:
- Só entram anúncios com status "Aberto para lances"/"Em breve"/"Aguardando"; encerrados/vendidos ficam fora.
- Avaliação: não é publicada como tal; usa-se o valor do 1º Leilão (nos judiciais = avaliação;
  nos extrajudiciais = valor de 1ª praça do credor). Se a descrição traz "avaliação R$ X", usa-se.
- O primeiro acesso redireciona (/canal -> cookie __CBCanal); a session do requests segue o redirect.
"""
import re, sys, os, time
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bs4 import BeautifulSoup
from common import session, money, city, tipo, desagio, flags, now_iso, save_raw

FONTE = "leilaovip"
BASE = "https://www.leilaovip.com.br"
THREADS = 3
MAX = int(os.environ.get("GARIMPO_MAX", "0") or 0)
XHR = {"X-Requested-With": "XMLHttpRequest"}
VEIC = re.compile(r"carro|moto|ve[ií]culo|caminh|ônibus|onibus|trator|m[áa]quina|equipamento|sucata|embarca|aeronave|diversos|eletr[ôo]nic|m[óo]veis e utens", re.I)

def _req(s, method, url, tries=3, **kw):
    for i in range(tries):
        try:
            r = s.request(method, url, timeout=60, **kw)
            if r.status_code == 200:
                return r.text
            print(f"[{FONTE}] HTTP {r.status_code} {method} {url}", file=sys.stderr)
            if r.status_code in (400, 404): return None
        except Exception as e:
            print(f"[{FONTE}] erro {e} {url}", file=sys.stderr)
        time.sleep(2 * (i + 1))
    return None

def _txt(e):
    return re.sub(r"\s+", " ", e.get_text(" ", strip=True)) if e else ""

def _date(t):
    m = re.search(r"(\d{2})/(\d{2})/(\d{4})", t or "")
    return f"{m.group(3)}-{m.group(2)}-{m.group(1)}" if m else None

def _form(sp):
    f = sp.select_one("form")
    if not f: return {}
    return {i.get("name"): i.get("value", "") for i in f.select("input") if i.get("name")}

def _eventos(s):
    codes, page = [], 1
    while True:
        h = _req(s, "POST", BASE + "/agenda?handler=pesquisarEventos", headers=XHR,
                 data={"Filtro.Segmento": "IMÓVEIS", "Filtro.CurrentPage": str(page)})
        if not h: break
        sp = BeautifulSoup(h, "html.parser")
        found = []
        for c in sp.select(".card-evento"):
            a = c.select_one('a[href^="/evento/detalhes/"]')
            if not a: continue
            cls = " ".join(c.get("class") or [])
            found.append({"code": a["href"].split("/evento/detalhes/")[-1].strip("/"), "status": cls,
                          "titulo": _txt(c.select_one(".anc-title")), "tipo_txt": _txt(c.select_one(".anc-left-txt"))})
        new = [f for f in found if f["code"] not in {x["code"] for x in codes}]
        print(f"[{FONTE}] agenda página {page}: {len(found)} eventos ({len(new)} novos)", file=sys.stderr)
        if not new: break
        codes.extend(new)
        page += 1
        time.sleep(0.6)
        if page > 60: break
    return codes

def _anuncios(s, ev):
    url = f"{BASE}/evento/detalhes/{ev['code']}"
    h = _req(s, "GET", url)
    if not h: return []
    sp = BeautifulSoup(h, "html.parser")
    form = _form(sp)
    links = {}
    for a in sp.select('a[href^="/evento/anuncio/"]'):
        links[a["href"]] = ev
    if not form.get("__RequestVerificationToken"):
        return list(links)
    page, empty = 1, 0
    while True:
        form["Filtro.CurrentPage"] = str(page)
        h2 = _req(s, "POST", url + "?handler=pesquisar", headers=dict(XHR, Referer=url), data=form)
        if not h2: break
        sp2 = BeautifulSoup(h2, "html.parser")
        new = 0
        for c in sp2.select(".card-anuncio"):
            a = c.select_one('a[href^="/evento/anuncio/"]')
            if not a: continue
            st = _txt(c.select_one(".situacao")).lower()
            tp = _txt(c.select_one(".anc-type"))
            if a["href"] not in links:
                links[a["href"]] = {"status_card": st, "tipo_card": tp}; new += 1
        if new == 0:
            empty += 1
            if empty >= 1: break
        page += 1
        time.sleep(0.4)
        if page > 40: break
    return [l for l, meta in links.items() if not VEIC.search((meta or {}).get("tipo_card", "") if isinstance(meta, dict) else "")]

def _detail(s, path):
    h = _req(s, "GET", BASE + path)
    time.sleep(0.3)
    if not h: return None
    sp = BeautifulSoup(h, "html.parser")
    d = {"url": BASE + path, "titulo": _txt(sp.select_one("h1")).replace("LOTE", "Lote")}
    d["titulo"] = re.sub(r"^Lote\s*\d+\s*:\s*", "", d["titulo"]).strip()
    # .an-desc: pares label/valor em sequência
    spans = [(x.get("class")[0] if x.get("class") else "", _txt(x)) for x in (sp.select_one(".an-desc") or sp).select("span")]
    pracas, cur = [], None
    for cls, t in spans:
        if cls == "an-descitm":
            m = re.match(r"(\d)[ºo°]\s*Leil[ãa]o|Leil[ãa]o\s*[ÚU]nico", t)
            if m:
                cur = {"n": int(m.group(1)) if m.group(1) else 1, "data": None, "valor": None}; pracas.append(cur)
            else:
                cur = None; d["_lbl"] = t
        elif cls == "an-descitm-fll":
            if cur is not None:
                if cur["data"] is None and re.search(r"\d{2}/\d{2}/\d{4}", t): cur["data"] = _date(t)
                elif cur["valor"] is None and "R$" in t: cur["valor"] = money(t)
            elif d.get("_lbl"):
                d[d.pop("_lbl").lower()] = t
    d["pracas"] = pracas
    for dt_ in sp.select(".an-details .an-dt"):
        lbl, val = _txt(dt_.select_one(".an-inflabel")).rstrip(":").lower(), _txt(dt_.select_one(".an-inffill"))
        d[lbl] = val
    d["endereco"] = _txt(sp.select_one(".an-end")).replace("Endereço:", "").strip()
    cty = _txt(sp.select_one(".an-cty"))
    m = re.search(r"Cidade:\s*(.*?)\s*Estado:\s*([A-Z]{2})", cty)
    if m: d["cidade"], d["uf"] = m.group(1).strip(), m.group(2)
    cep = re.search(r"(\d{5}-?\d{3})", cty)
    d["cep"] = cep.group(1) if cep else None
    d["leiloeiro"] = _txt(sp.select_one(".an-lei")).replace("Leiloeiro:", "").strip() or None
    obs = sp.select_one(".an-obs")
    d["descricao"] = re.sub(r"\n\s*\n+", "\n", obs.get_text("\n", strip=True)) if obs else ""
    for a in sp.select("a.an-document[href]"):
        t = _txt(a).lower()
        if "matr" in t: d.setdefault("matricula_url", a["href"])
        elif "edital" in t: d.setdefault("edital_url", a["href"])
    com = sp.select_one("img.an-comit")
    d["comitente"] = (com.get("alt") or "").replace("Logo do comitente", "").strip() if com else None
    h2 = sp.find("h2", string=re.compile(r"Inicial"))
    d["inicial"] = money(_txt(h2).split(":")[-1]) if h2 else None
    lot = sp.find(string=re.compile(r"Leil[ãa]o\s+[A-Z0-9]{5,}"))
    m = re.search(r"Leil[ãa]o\s*:?\s*([A-Z0-9\-]{4,})", lot or "")
    d["evento_codigo"] = m.group(1) if m else None
    fotos = []
    for im in sp.select("img[src*='blob.core.windows.net/uploads/']"):
        src = im.get("src")
        if src and src not in fotos and not re.search(r"\.pdf$", src, re.I): fotos.append(src)
    d["fotos"] = fotos[:20]
    return d

def _build(d):
    st = (d.get("status") or "").lower()
    if not st or not re.search(r"aberto|em breve|aguard|dispon", st): return None
    if re.search(r"encerrad|vendid|suspens|cancel|retirad", st): return None
    cat = d.get("categoria") or ""
    if VEIC.search(cat): return None
    uf = d.get("uf")
    if not uf:
        m = re.search(r"\b([A-Z]{2})\s*$", d["titulo"]) or re.search(r"/\s*([A-Z]{2})\b", d["titulo"])
        uf = m.group(1) if m else None
    if not uf: return None
    cid = d.get("cidade")
    if not cid:
        m = re.search(r"[-–]\s*([A-ZÀ-Ú' ]{3,40}?)\s*/\s*" + uf, d["titulo"])
        if m: cid = m.group(1)
    pr = d.get("pracas") or []
    vals = [p for p in pr if p.get("valor")]
    today = time.strftime("%Y-%m-%d")
    if vals:
        praca, cur = 1, vals[0]
        if len(vals) >= 2:
            praca = 2 if (vals[0].get("data") and vals[0]["data"] < today) else 1
            cur = vals[1] if praca == 2 else vals[0]
    else:
        # praça única sem valores no bloco: usa "Inicial" e a data do único leilão listado
        praca, cur = 1, {"valor": d.get("inicial"), "data": next((p.get("data") for p in pr if p.get("data")), None)}
        vals = [cur] if cur["valor"] else []
    lance = d.get("inicial") or cur.get("valor")
    aval = money(d.get("avaliação")) or (vals[0]["valor"] if vals else None)
    m = re.search(r"avalia[çc][ãa]o[^R\n]{0,40}R\$\s*([\d\.]+,\d{2})", d.get("descricao") or "", re.I)
    if m and not d.get("avaliação"): aval = money(m.group(1)) or aval
    if not lance or not aval: return None
    if aval < lance: aval = lance
    tl = (d.get("tipo de leilão") or "").lower()
    if "extra" in tl: modalidade = "extrajudicial"
    elif "judicial" in tl: modalidade = "judicial"
    elif "direta" in tl: modalidade = "venda_direta"
    else: modalidade = "outro"
    tt = tipo(cat)
    if tt == "outro": tt = tipo(d["titulo"])
    sit = (d.get("situação") or "").lower()
    ocupado = True if sit.startswith("ocupad") else (False if "desocupad" in sit else None)
    desc = d.get("descricao") or ""
    if ocupado is None:
        if re.search(r"\bdesocupad", desc, re.I): ocupado = False
        elif re.search(r"\bocupad", desc, re.I): ocupado = True
    mat = re.search(r"matr[ií]cula\(?s?\)?:?\s*(?:n[º°o.]*\s*)?([\d\.]{3,})", desc, re.I)
    cart = re.search(r"(\d{1,2}\s*[º°oa]?\s*(?:CRI|Cart[óo]rio|Of[ií]cio|Oficial|Registro)[^\.\n\-–,;]{0,60}|Registro de Im[óo]veis de [^\.\n,;]{3,50})", desc, re.I)
    proc = re.search(r"processo\s*n?[º°.]?\s*([\d\.\-]{15,25})", desc, re.I)
    ac = re.search(r"[áa]rea (?:constru[ií]da|privativa|útil|util)[^\d]{0,15}([\d\.]+,\d+|\d+)\s*m", desc, re.I)
    at = re.search(r"terreno[^\d]{0,30}([\d\.]+,\d+|\d+)\s*m", desc, re.I)
    fl = flags(d["titulo"] + "\n" + desc)
    item = {
        "id": f"{FONTE}:{d.get('código') or d['url'].rsplit('-', 1)[-1]}",
        "fonte": FONTE,
        "url": d["url"],
        "tipo": tt,
        "titulo": d["titulo"],
        "endereco": d.get("endereco") or None,
        "cep": d.get("cep"),
        "cidade": city(cid or ""),
        "uf": uf,
        "area_privativa_m2": money(ac.group(1)) if ac else None,
        "area_terreno_m2": money(at.group(1)) if at else None,
        "avaliacao": aval,
        "lance_minimo": lance,
        "desagio_pct": desagio(aval, lance),
        "modalidade": modalidade,
        "praca": praca,
        "data_leilao": cur.get("data"),
        "data_fim": cur.get("data"),
        "lance_1a_praca": vals[0]["valor"],
        "lance_2a_praca": vals[1]["valor"] if len(vals) > 1 else None,
        "leiloeiro": d.get("leiloeiro") or "Leilão VIP",
        "comitente": d.get("comitente") or None,
        "processo": proc.group(1) if proc else None,
        "matricula": mat.group(1) if mat else None,
        "cartorio": cart.group(1).strip() if cart else None,
        "ocupado": ocupado,
        "fotos": d.get("fotos") or [],
        "edital_url": d.get("edital_url"),
        "matricula_url": d.get("matricula_url"),
        "direitos_fiduciante": fl["direitos_fiduciante"],
        "fracao_ideal": fl["fracao_ideal"],
        "descricao": desc[:6000],
        "coletado_em": now_iso(),
    }
    return {k: v for k, v in item.items() if v is not None or k in ("praca", "ocupado", "data_leilao")}

def collect():
    s = session()
    _req(s, "GET", BASE + "/")  # cookie de canal
    evs = _eventos(s)
    print(f"[{FONTE}] {len(evs)} eventos de imóveis; listando anúncios...", file=sys.stderr)
    paths, seen = [], set()
    for i, ev in enumerate(evs, 1):
        try:
            for p in _anuncios(s, ev):
                if p not in seen:
                    seen.add(p); paths.append(p)
        except Exception as e:
            print(f"[{FONTE}] falha evento {ev['code']}: {e}", file=sys.stderr)
        if i % 20 == 0: print(f"[{FONTE}] eventos {i}/{len(evs)} -> {len(paths)} anúncios", file=sys.stderr)
        time.sleep(0.3)
        if MAX and len(paths) >= MAX: break
    if MAX: paths = paths[:MAX]
    print(f"[{FONTE}] {len(paths)} anúncios; buscando detalhes...", file=sys.stderr)
    items, ids = [], set()
    def work(p):
        try:
            d = _detail(s, p)
            return _build(d) if d else None
        except Exception as e:
            print(f"[{FONTE}] falha {p}: {e}", file=sys.stderr)
            return None
    with ThreadPoolExecutor(THREADS) as ex:
        for i, it in enumerate(ex.map(work, paths), 1):
            if it and it["id"] not in ids:
                ids.add(it["id"]); items.append(it)
            if i % 50 == 0: print(f"[{FONTE}] detalhes {i}/{len(paths)}", file=sys.stderr)
    return items

if __name__ == "__main__":
    save_raw(FONTE, collect())
