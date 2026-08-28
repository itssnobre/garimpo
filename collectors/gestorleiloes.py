"""Coletor Gestor Leilões (www.gestorleiloes.com.br), Brasil inteiro (na prática RS: leiloeiro de Porto Alegre).

Plataforma "leilaoprocore" (Symfony + fos_js_routing, atrás de Cloudflare; HTML server-side responde 200 a
UA de navegador, sem captcha). Não há API JSON pública de lotes: as rotas ajax (/leilao/{id}/atualiza_botoes_lotes,
/core/atualiza_status_lote...) só servem o auditório ao vivo (Mercure/Pusher). Tudo é HTML + bs4.

  Listagem:  1) https://www.gestorleiloes.com.br/leilao/lotes/imoveis  (categoria; cards com link /leilao/<slug>/lote_id/<id>;
                paginação ?page=N via ul.pagination quando existir)
             2) https://www.gestorleiloes.com.br/leilao/proximos  ->  cada leilão /leilao/<slug>/lotes/lista (cards
                .card-lote-interno com badge de status e link do lote; 1ª/2ª DATA e LEILOEIRO no card .auction-dados).
             As duas fontes são unidas e deduplicadas por URL do lote. /leilao/encerrados é ignorado
             (GARIMPO_DEBUG_ENCERRADOS=1 inclui os encerrados só para testar o parser, marcando status).
  Detalhe:   /leilao/<slug>/lote_id/<id>: .card-informacoes (AVALIAÇÃO, LANCE MÍNIMO), .lance-inicial-valor (lance atual),
             #collapseDescricao/#collapseObservacoes (descrição), .info-judicial-item (processo, vara, tipo de ação),
             .documento-item (edital, matrícula, laudo...), .info-adicional-item (data do leilão, modalidade),
             carrossel de fotos /uploads/media/default/.

Limitações:
- O site não publica cidade/UF em campo próprio: extraídos por regex do título/descrição ("Cidade / RS", "Cidade - RS"),
  com fallback na Vara Judicial. Lote sem UF identificável é descartado.
- Status "vendido/encerrado/suspenso/cancelado/retirado" (badge da lista ou overlay "LOTE VENDIDO" no detalhe) e leilão
  com data já passada são descartados.
- Em 28/08/2026 o site estava sem nenhum leilão ativo ("No momento não possuímos leilões marcados"); histórico de 8 leilões,
  1 imóvel. O parser foi validado com o lote encerrado (GARIMPO_DEBUG_ENCERRADOS=1).
"""
import re, sys, os, time, datetime as dt
from urllib.parse import urljoin
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bs4 import BeautifulSoup
from common import session, money, city, tipo, desagio, flags, now_iso, save_raw, strip_accents

FONTE = "gestorleiloes"
BASE = "https://www.gestorleiloes.com.br"
LIST_IMOVEIS = BASE + "/leilao/lotes/imoveis"
LIST_PROXIMOS = BASE + "/leilao/proximos"
LIST_ENCERRADOS = BASE + "/leilao/encerrados"
UFS = {"AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"}
MAX = int(os.environ.get("GARIMPO_MAX", "0") or 0)
DEBUG_ENC = os.environ.get("GARIMPO_DEBUG_ENCERRADOS") == "1"
SKIP = ("vendido", "encerrad", "suspens", "cancelad", "retirad", "arrematad")

def _log(m): print(f"[{FONTE}] {m}", file=sys.stderr)

def _get(s, url, params=None, tries=3):
    for i in range(tries):
        try:
            r = s.get(url, params=params, timeout=40)
            if r.status_code == 200: return r.text
            if r.status_code == 404: return None
            _log(f"HTTP {r.status_code} {url}")
        except Exception as e:
            _log(f"erro {e} {url}")
        time.sleep(1.5 * (i + 1))
    return None

def _txt(e): return re.sub(r"\s+", " ", e.get_text(" ", strip=True)) if e else ""

def _date(t):
    m = re.search(r"(\d{2})/(\d{2})/(\d{4})", t or "")
    return f"{m.group(3)}-{m.group(2)}-{m.group(1)}" if m else None

def _abs(u): return urljoin(BASE, u) if u else None

# ---------------------------------------------------------------- listagem
def _lot_links(sp):
    """Links de lote em uma página + status vindo do card (.badge) quando houver."""
    out = {}
    for a in sp.select('a[href*="/lote_id/"]'):
        href = a["href"]
        if not (href.startswith("/") or href.startswith(BASE)): continue  # ignora share (facebook/whatsapp/x)
        url = _abs(href.split("?")[0])
        card = a.find_parent(class_=re.compile(r"card-lote-interno|card-vertical|card-horizontal|card"))
        st = " ".join(_txt(b) for b in card.select(".badge, .badges-container, [style*='z-index']")).lower() if card else ""
        rec = out.setdefault(url, {"url": url, "status": ""})
        if st and not rec["status"]: rec["status"] = st
        if card and not rec.get("titulo"):
            t = card.select_one(".card-title a, h4.card-title, .card-title")
            if t: rec["titulo"] = _txt(t)
    return out

def _pages(s, url):
    """Itera páginas de uma listagem (?page=N) enquanto houver ul.pagination apontando adiante."""
    page, last = 1, None
    while True:
        h = _get(s, url, {"page": page} if page > 1 else None)
        if not h: return
        sp = BeautifulSoup(h, "html.parser")
        yield sp
        if last is None:
            nums = [int(m.group(1)) for a in sp.select("ul.pagination a[href], .pagination a[href]")
                    for m in [re.search(r"page=(\d+)", a["href"])] if m]
            last = max(nums) if nums else 1
        if page >= last: return
        page += 1
        time.sleep(0.5)

def _auctions(sp):
    """Cards de leilão (.auction-dados ou links /lotes/lista): slug -> {datas, leiloeiro, titulo}."""
    out = {}
    for a in sp.select('a[href*="/lotes/lista"]'):
        m = re.search(r"/leilao/([^/]+)/lotes/lista", a["href"])
        if not m: continue
        slug = m.group(1)
        card = a.find_parent(class_=re.compile(r"card")) or a.parent
        rec = out.setdefault(slug, {"slug": slug, "url": BASE + f"/leilao/{slug}/lotes/lista", "datas": [], "leiloeiro": None, "titulo": ""})
        if not rec["titulo"]:
            rec["titulo"] = _txt(card.select_one(".card-title, h3, h4"))
            rec["datas"] = [_date(_txt(ib)) for ib in card.select(".info-box") if re.search(r"\dª DATA", _txt(ib))]
            rec["datas"] = [d for d in rec["datas"] if d]
            for ib in card.select(".info-box"):
                if "LEILOEIRO" in _txt(ib): rec["leiloeiro"] = _txt(ib.select_one("strong")) or None
            for m2 in re.finditer(r"(\d{2}/\d{2}/\d{4})", _txt(card)):
                d = _date(m2.group(1))
                if d and d not in rec["datas"]: rec["datas"].append(d)
    return out

def _list_all(s):
    lots, auctions = {}, {}
    # 1) categoria imóveis
    for sp in _pages(s, LIST_IMOVEIS):
        found = _lot_links(sp)
        _log(f"categoria imóveis: {len(found)} lotes")
        lots.update(found)
    time.sleep(0.5)
    # 2) próximos leilões -> lista de lotes de cada leilão
    srcs = [LIST_PROXIMOS] + ([LIST_ENCERRADOS] if DEBUG_ENC else [])
    for src in srcs:
        for sp in _pages(s, src):
            auctions.update(_auctions(sp))
    _log(f"{len(auctions)} leilões em {'próximos+encerrados' if DEBUG_ENC else 'próximos'}")
    for slug, au in auctions.items():
        h = _get(s, au["url"]); time.sleep(0.4)
        if not h: continue
        sp = BeautifulSoup(h, "html.parser")
        # datas/leiloeiro do cabeçalho do leilão (mais completos que o card da listagem)
        head = _auctions(sp).get(slug)
        if head:
            au["datas"] = head["datas"] or au["datas"]; au["leiloeiro"] = head["leiloeiro"] or au["leiloeiro"]
            au["titulo"] = au["titulo"] or head["titulo"]
        found = _lot_links(sp)
        for u, rec in found.items():
            rec["leilao"] = au
            if u in lots: lots[u].update({k: v for k, v in rec.items() if v})
            else: lots[u] = rec
    return list(lots.values())

# ---------------------------------------------------------------- detalhe
def _detail(s, url):
    h = _get(s, url); time.sleep(0.4)
    if not h: return None
    sp = BeautifulSoup(h, "html.parser")
    d = {"url": url}
    d["titulo"] = _txt(sp.select_one(".bem-info-container h4, .bem-descricao h4, h4.black"))
    d["lote"] = _txt(sp.select_one("h1.card-lote-title"))
    for c in sp.select(".card-informacoes"):
        k, v = strip_accents(_txt(c.select_one("h5.titulo")).lower()), money(_txt(c.select_one("h4")))
        if "avalia" in k: d["avaliacao"] = v
        elif "lance minimo" in k or "lance inicial" in k: d["lance_minimo"] = v
        elif "incremento" in k: d["incremento"] = v
    la = sp.select_one(".lance-inicial-valor, .valor-card .valor-preco")
    d["lance_atual"] = money(_txt(la)) if la else None
    d["lance_titulo"] = _txt(sp.select_one(".lance-inicial-titulo")).lower()
    # status: badges do lote + overlays ("LOTE VENDIDO", "ENCERRADO"...)
    st = [_txt(b) for b in sp.select(".card-lote-badges .badge, .card-lote-badges span")]
    st += [_txt(o) for o in sp.select("[style*='z-index']") if re.search(r"LOTE |VENDIDO|ENCERRAD|SUSPENS|CANCELAD|RETIRAD", _txt(o))]
    d["status"] = " ".join(st).lower()
    d["descricao"] = "\n".join(t for t in (
        re.sub(r"\n\s*\n+", "\n", x.get_text("\n", strip=True)) for x in sp.select("#collapseDescricao, #collapseObservacoes, #collapseInfoImovel")) if t)
    for it in sp.select(".info-judicial-item"):
        k, v = strip_accents(_txt(it.select_one(".info-judicial-label")).lower()), _txt(it.select_one(".info-judicial-value"))
        if v.lower() in ("", "nao informado", "não informado"): continue
        if "processo" in k: d["processo"] = v
        elif "vara" in k: d["vara"] = v
        elif "tipo de acao" in k: d["tipo_acao"] = v
        elif "exequente" in k: d["exequente"] = v
    for it in sp.select(".documento-item"):
        t = strip_accents(_txt(it.select_one(".documento-titulo")).lower())
        a = it.select_one("a.visualizar[href]") or it.select_one("a[href$='.pdf']") or it.select_one("a.download[href]")
        if not a: continue
        if "edital" in t and "edital_url" not in d: d["edital_url"] = _abs(a["href"])
        elif "matric" in t and "matricula_url" not in d: d["matricula_url"] = _abs(a["href"])
    for it in sp.select(".info-adicional-item"):
        k = strip_accents(_txt(it.select_one(".info-adicional-titulo")).lower()); v = _txt(it.select_one(".info-adicional-valor"))
        if "data" in k: d["data_leilao"] = _date(v)
        elif "modalidade" in k: d["pregao"] = v
        elif "leil" in k: d["leilao_titulo"] = v
    fotos, seen = [], set()
    for im in sp.select("img[src*='/uploads/media/default/'], img[data-src*='/uploads/media/default/']"):
        src = im.get("src") or im.get("data-src")
        src = re.sub(r"/media/cache/(resolve/)?[a-z_]+/uploads/", "/uploads/", src)
        src = _abs(src)
        if src not in seen and "/documentos" not in src:
            seen.add(src); fotos.append(src)
    d["fotos"] = fotos
    ll = _txt(sp.select_one(".info-leiloeiro, .leiloeiro"))
    if ll: d["leiloeiro"] = ll
    d["texto_total"] = _txt(sp.select_one("#conteudo") or sp)
    return d

# ---------------------------------------------------------------- normalização
CID_RE = re.compile(r"([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wÀ-ú'\.]*(?:\s+(?:d[aeo]s?|[A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wÀ-ú'\.]*))*)\s*[/\-–]\s*([A-Z]{2})\b")

def _cidade_uf(*texts):
    for t in texts:
        for m in CID_RE.finditer(t or ""):
            cid, uf = m.group(1).strip(), m.group(2)
            if uf in UFS and len(cid) >= 3 and strip_accents(cid).lower() not in ("leilao", "imovel", "imoveis", "lote"):
                cid = re.sub(r"^(?:Leil[aã]o (?:de )?Im[oó]vel|Im[oó]vel|Cidade de|Comarca de|em|de)\s+", "", cid, flags=re.I).strip(" -–/")
                return cid, uf
    return None, None

def _area(desc):
    t = strip_accents((desc or "").lower())
    m = re.search(r"area[^.\n]{0,40}?([\d.]+(?:,\d+)?)\s*(?:m2|m²|metros quadrados)", t)
    if m: return money(m.group(1)), "m2"
    m = re.search(r"area[^.\n]{0,40}?([\d.]+(?:,\d+)?)\s*(?:ha\b|hectares?)", t)
    if m:
        v = money(m.group(1)); return (v * 10000 if v else None), "ha"
    return None, None

def _build(lot, d, today):
    if not d: return None
    status = ((lot.get("status") or "") + " " + (d.get("status") or "")).lower()
    if any(k in status for k in SKIP) and not DEBUG_ENC: return None
    titulo = d.get("titulo") or lot.get("titulo") or ""
    desc = d.get("descricao") or ""
    au = lot.get("leilao") or {}
    ltitle = d.get("leilao_titulo") or au.get("titulo") or ""
    allt = " ".join([titulo, ltitle, desc, d.get("tipo_acao") or ""])
    # só imóveis
    tt = tipo(titulo)
    if tt == "outro": tt = tipo(desc[:400])
    if tt == "outro" and re.search(r"hectare|\bha\b|gleba|chacara", strip_accents(allt).lower()): tt = "rural"
    if tt == "outro" and not re.search(r"im[oó]ve", strip_accents(allt).lower() + allt.lower()): return None
    if re.search(r"(?i)\b(ve[ií]culo|autom[oó]vel|caminh[aã]o|motocicleta|celta|mercedes|fiat|toyota)\b", titulo) and tt == "outro": return None
    cid, uf = _cidade_uf(titulo, desc, ltitle, d.get("vara"))
    if not uf: return None
    aval = d.get("avaliacao")
    lance = d.get("lance_atual") or d.get("lance_minimo")
    if not lance and aval: lance = aval
    if not aval and lance: aval = lance
    if not aval or not lance: return None
    data = d.get("data_leilao")
    datas = sorted(set(au.get("datas") or []))
    if data and data < today and not DEBUG_ENC: return None
    praca = None
    if data and datas: praca = datas.index(data) + 1 if data in datas else None
    if praca is None and datas and today: praca = 1 if today <= datas[0] else (2 if len(datas) > 1 else 1)
    mod_t = strip_accents(" ".join([titulo, ltitle, d.get("pregao") or ""]).lower())
    if "extrajudicial" in mod_t: modalidade = "extrajudicial"
    elif "venda direta" in mod_t: modalidade = "venda_direta"
    elif "judicial" in mod_t or d.get("processo"): modalidade = "judicial"
    else: modalidade = "outro"
    low = strip_accents(desc.lower())
    ocupado = None
    if re.search(r"\bdesocupad", low): ocupado = False
    elif re.search(r"\bocupad", low): ocupado = True
    mat = re.search(r"matr[ií]cula\(?s?\)?:?\s*(?:n[º°o.]*\s*)?([\d\.]+)", desc, re.I)
    cart = re.search(r"((?:\d{1,2}\s*[º°oa]?\s*)?\b(?:CRI|Cart[óo]rio|Of[ií]cio|Registro de Im[óo]veis)\b[^\.\n;]{0,60})", desc, re.I)
    area, unit = _area(desc + "\n" + titulo)
    fl = flags(titulo + "\n" + desc)
    lote_id = re.search(r"/lote_id/(\d+)", d["url"]).group(1)
    item = {
        "id": f"{FONTE}:{lote_id}",
        "fonte": FONTE,
        "url": d["url"],
        "tipo": tt,
        "titulo": titulo,
        "cidade": city(cid or ""),
        "uf": uf,
        "area_privativa_m2": area if tt in ("apartamento", "comercial") else None,
        "area_terreno_m2": area if tt in ("terreno", "rural", "casa", "outro") else None,
        "avaliacao": aval,
        "lance_minimo": lance,
        "desagio_pct": desagio(aval, lance),
        "modalidade": modalidade,
        "praca": praca,
        "data_leilao": data or (datas[0] if datas else None),
        "data_fim": data or (datas[-1] if datas else None),
        "lance_1a_praca": aval if len(datas) > 1 else None,
        "lance_2a_praca": d.get("lance_minimo") if len(datas) > 1 else None,
        "leiloeiro": d.get("leiloeiro") or au.get("leiloeiro"),
        "processo": d.get("processo"),
        "vara": d.get("vara"),
        "matricula": mat.group(1) if mat else None,
        "cartorio": cart.group(1).strip() if cart else None,
        "ocupado": ocupado,
        "direitos_fiduciante": fl["direitos_fiduciante"],
        "fracao_ideal": fl["fracao_ideal"],
        "edital_url": d.get("edital_url"),
        "matricula_url": d.get("matricula_url"),
        "fotos": d.get("fotos") or [],
        "descricao": desc[:6000],
        "coletado_em": now_iso(),
    }
    if DEBUG_ENC: item["status_debug"] = status.strip()
    return {k: v for k, v in item.items() if v is not None or k in ("praca", "ocupado", "data_leilao")}

def collect():
    s = session()
    today = dt.date.today().isoformat()
    items = []
    try:
        lots = _list_all(s)
        lots = [l for l in lots if DEBUG_ENC or not any(k in l.get("status", "") for k in SKIP)]
        if MAX: lots = lots[:MAX]
        _log(f"{len(lots)} lotes candidatos; buscando detalhes...")
        seen = set()
        for i, lot in enumerate(lots, 1):
            try:
                it = _build(lot, _detail(s, lot["url"]), today)
            except Exception as e:
                _log(f"falha {lot['url']}: {e}"); it = None
            if it and it["id"] not in seen:
                seen.add(it["id"]); items.append(it)
            if i % 25 == 0: _log(f"detalhes {i}/{len(lots)}")
    except Exception as e:
        _log(f"erro geral: {e}")
    return items

if __name__ == "__main__":
    save_raw(FONTE, collect())
