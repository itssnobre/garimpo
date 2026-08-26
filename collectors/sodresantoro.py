"""Coletor Sodré Santoro (www.sodresantoro.com.br/imoveis), estado de SP.

Método: API JSON interna do site (Nuxt server routes, protegidas por WAF Azion):
  1) GET  https://www.sodresantoro.com.br/imoveis/lotes  (só para obter cookies az_asm/az_botm;
     precisa de headers de navegação: Sec-Fetch-*, sec-ch-ua, Upgrade-Insecure-Requests)
  2) POST https://www.sodresantoro.com.br/api/search-lots  (corpo Elasticsearch: query/from/size)
     filtro: leilão online/aberto, lot_state = "são paulo", segmento imoveis OU lot_is_property
     (judiciais ficam no segmento "judiciais" com lot_is_property=true).
  3) GET  https://www.sodresantoro.com.br/api/lots/{auction_id}/{lot_id}  (detalhe: documentos,
     endereço, fotos, dados judiciais, parcelamento).

Sem os headers de browser o WAF devolve 403 (página "Azion - Default error page").
Campos judiciais: tj_praca_value = avaliação, tj_praca_discount = % de desconto da 2ª praça,
lot_praca_label / lot_praca_status = praça vigente.
URL do lote: https://www.sodresantoro.com.br/leilao/{auction_id}/lote/{lot_id}
"""
import re, sys, os, time, json, html
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import session, money, city, tipo, desagio, flags, now_iso, save_raw

SITE = "https://www.sodresantoro.com.br"
CH_UA = '"Chromium";v="126", "Google Chrome";v="126", "Not-A.Brand";v="99"'
NAV = {"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", "Sec-Fetch-Mode": "navigate",
       "Sec-Fetch-Dest": "document", "Sec-Fetch-Site": "none", "Sec-Fetch-User": "?1", "Upgrade-Insecure-Requests": "1",
       "sec-ch-ua": CH_UA, "sec-ch-ua-mobile": "?0", "sec-ch-ua-platform": '"macOS"'}
XHR = {"Accept": "application/json", "Content-Type": "application/json", "Referer": SITE + "/imoveis/lotes",
       "Sec-Fetch-Mode": "cors", "Sec-Fetch-Dest": "empty", "Sec-Fetch-Site": "same-origin",
       "sec-ch-ua": CH_UA, "sec-ch-ua-mobile": "?0", "sec-ch-ua-platform": '"macOS"'}
STATUS = {"bool": {"should": [
    {"bool": {"must": [{"term": {"auction_status": "online"}}]}},
    {"bool": {"must": [{"term": {"auction_status": "aberto"}}], "must_not": [{"terms": {"lot_status_id": [5, 7]}}]}},
], "minimum_should_match": 1}}
PAGE = 100

def _req(s, method, url, tries=3, **kw):
    for i in range(tries):
        try:
            r = s.request(method, url, timeout=40, **kw)
            if r.status_code == 200:
                return r
            print(f"[sodresantoro] HTTP {r.status_code} {url}", file=sys.stderr)
            if r.status_code == 403 and i == 0:
                s.get(SITE + "/imoveis/lotes", headers=NAV, timeout=40)  # renova cookies do WAF
        except Exception as e:
            print(f"[sodresantoro] erro {e} {url}", file=sys.stderr)
        time.sleep(1.5 * (i + 1))
    return None

def _search(s, frm):
    body = {"query": {"bool": {"filter": [
        STATUS, {"term": {"lot_state": "são paulo"}},
        {"bool": {"should": [{"term": {"segment_slug": "imoveis"}}, {"term": {"lot_is_property": True}}], "minimum_should_match": 1}},
    ]}}, "from": frm, "size": PAGE, "sort": [{"lot_id": "asc"}]}
    r = _req(s, "POST", SITE + "/api/search-lots", data=json.dumps(body), headers=XHR)
    if r is None:
        body.pop("sort")
        r = _req(s, "POST", SITE + "/api/search-lots", data=json.dumps(body), headers=XHR)
    return r.json() if r is not None else None

def _detail(s, auction_id, lot_id):
    r = _req(s, "GET", f"{SITE}/api/lots/{auction_id}/{lot_id}", headers=XHR)
    time.sleep(0.3)
    try:
        return r.json() if r is not None else {}
    except Exception:
        return {}

def _strip(t):
    t = re.sub(r"<br\s*/?>", "\n", t or "")
    t = re.sub(r"<[^>]+>", " ", t)
    return re.sub(r"[ \t]+", " ", html.unescape(t)).strip()

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

def _kv(lst):
    return {(x.get("key") or "").strip().lower(): (x.get("value") or "").strip() for x in (lst or []) if isinstance(x, dict)}

def _item(r, det):
    aid, lid = r.get("auction_id"), r.get("lot_id")
    desc = _strip(det.get("description") or r.get("lot_description") or "")
    title = (r.get("lot_title") or det.get("title") or "").strip()
    title = re.sub(r"^\d+\s*-\s*", "", title)
    opt = _kv(det.get("optionalItems"))
    jud = _kv(det.get("judicial"))
    lance = money(r.get("bid_actual") or r.get("bid_initial"))
    aval = money(r.get("tj_praca_value")) if r.get("tj_praca_value") else None
    if not aval:
        mv = re.search(r"(?i)avalia(?:[çc][aã]o|d[oa])[^R$\n]{0,60}R\$\s*([\d\.]+,\d{2})", desc)
        aval = money(mv.group(1)) if mv else None
    if not aval or (lance and aval < lance): aval = lance
    is_jud = bool(r.get("lot_is_judicial"))
    modalidade = "judicial" if is_jud else ("venda_direta" if re.search(r"(?i)venda direta", desc[:2000]) else "extrajudicial")
    praca = None
    pl = (r.get("lot_praca_label") or "").lower()
    mp = re.search(r"(\d)", pl)
    if mp: praca = int(mp.group(1))
    elif r.get("lot_praca_status"): praca = int(str(r["lot_praca_status"])[0]) if str(r["lot_praca_status"])[0].isdigit() else None
    elif "única" in pl or "unica" in pl: praca = 1
    data = (r.get("lot_date_end") or det.get("dateEnd") or "")[:10] or None
    occ = (r.get("lot_occupied") or "").lower()
    ocupado = False if "desocupado" in occ else (True if "ocupado" in occ else None)
    if ocupado is None:
        low = desc.lower()
        if re.search(r"\bdesocupad", low): ocupado = False
        elif re.search(r"\bocupad", low): ocupado = True
    docs = det.get("documents") or []
    edital = next((d.get("href") for d in docs if "edital" in (d.get("name") or "").lower()), None)
    matric_url = next((d.get("href") for d in docs if "matr" in (d.get("name") or "").lower()), None)
    fotos = [p.get("src") for p in det.get("pictures") or [] if p.get("src")] or [p for p in r.get("lot_pictures") or [] if p]
    mm = re.search(r"matr[ií]cula\s*(?:sob\s*)?(?:n[º°o.]*\s*)?([\d\.]+)", desc, re.I)
    cart = re.search(r"(\d{1,2}\s*[º°oa]?\s*(?:CRI|Cart[óo]rio|Of[ií]cio|Oficial)[^\.\n\-–,;]{0,60})", desc, re.I)
    cat = r.get("lot_category") or opt.get("tipo") or ""
    tt = tipo(cat)
    if tt == "outro": tt = tipo(title)
    if tt == "outro" and "residencial" in (cat + title).lower(): tt = "casa"
    fl = flags(title + "\n" + desc)
    deb = _debitos(desc)
    inst = det.get("installments")
    pag = (det.get("messagePayment") or "") + " " + desc
    endereco = (det.get("location") or {}).get("address") or opt.get("endereço") or r.get("lot_street")
    area_u = money(r.get("lot_useful_area")) or None
    area_t = money(r.get("lot_total_area")) or None
    item = {
        "id": f"sodresantoro:{lid}",
        "fonte": "sodresantoro",
        "url": f"{SITE}/leilao/{aid}/lote/{lid}",
        "tipo": tt,
        "titulo": title[:200],
        "endereco": endereco,
        "bairro": city(opt.get("bairro") or r.get("lot_neighborhood") or "") or None,
        "cidade": city(opt.get("cidade") or r.get("lot_city") or ""),
        "uf": "SP",
        "area_privativa_m2": area_u if area_u and area_u > 0 else None,
        "area_terreno_m2": area_t if area_t and area_t > 0 and tt == "terreno" else None,
        "quartos": int(r["lot_dormitories"]) if str(r.get("lot_dormitories") or "0").isdigit() and int(r["lot_dormitories"]) > 0 else None,
        "avaliacao": aval,
        "lance_minimo": lance,
        "desagio_pct": desagio(aval, lance),
        "modalidade": modalidade,
        "praca": praca,
        "data_leilao": data,
        "data_fim": data,
        "ocupado": ocupado,
        "aceita_financiamento": True if re.search(r"(?i)financ", pag) else None,
        "aceita_fgts": True if re.search(r"(?i)fgts", pag) else None,
        "debitos_regra": deb,
        "debitos_por_conta_comprador": (True if re.search(r"(arrematante|comprador)", deb, re.I) and not re.search(r"(vendedor|comitente|quitad)", deb, re.I) else (False if re.search(r"(vendedor|comitente|quitad)", deb, re.I) else None)) if deb else None,
        "direitos_fiduciante": fl["direitos_fiduciante"],
        "fracao_ideal": fl["fracao_ideal"],
        "matricula": mm.group(1).rstrip(".") if mm else None,
        "cartorio": cart.group(1).strip() if cart else None,
        "edital_url": edital,
        "matricula_url": matric_url,
        "fotos": fotos,
        "descricao": (desc + ("\n\nProcesso: " + jud.get("processo", "") + " | " + jud.get("vara", "") if jud else "") + (f"\n\nParcelamento: {inst}" if inst else ""))[:6000],
        "coletado_em": now_iso(),
    }
    return {k: v for k, v in item.items() if v is not None or k in ("praca", "ocupado", "data_leilao")}

def collect():
    s = session()
    s.headers.update({"Accept-Language": "pt-BR,pt;q=0.9"})
    if _req(s, "GET", SITE + "/imoveis/lotes", headers=NAV) is None:
        print("[sodresantoro] bloqueado pelo WAF na página inicial; retornando vazio", file=sys.stderr)
        return []
    items, frm, total = [], 0, None
    while True:
        d = _search(s, frm)
        if not d:
            break
        res = d.get("results") or []
        total = d.get("total", total)
        print(f"[sodresantoro] busca from={frm}: {len(res)} lotes (total {total})", file=sys.stderr)
        for r in res:
            try:
                det = _detail(s, r.get("auction_id"), r.get("lot_id"))
                it = _item(r, det)
                if it.get("lance_minimo"): items.append(it)
            except Exception as e:
                print(f"[sodresantoro] falha lote {r.get('lot_id')}: {e}", file=sys.stderr)
        frm += len(res)
        if not res or len(res) < PAGE or (total and frm >= total):
            break
        time.sleep(0.5)
    seen, out = set(), []
    for it in items:
        if it["id"] in seen: continue
        seen.add(it["id"]); out.append(it)
    return out

if __name__ == "__main__":
    save_raw("sodresantoro", collect())
