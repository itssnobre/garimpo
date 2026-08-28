"""Coletor Resale (www.resale.com.br), outlet imobiliário de bancos (BB, Santander, Bradesco, Emgea...), Brasil inteiro.

SPA React que consome uma API REST em AWS API Gateway (chaves públicas no bundle main.*.chunk.js):
  Base:     https://q3jhhgksa9.execute-api.us-east-2.amazonaws.com/prod
  Headers:  X-API-KEY (do bundle) + Origin/User-Agent de navegador (sem Origin o gateway devolve 403 Forbidden).
  Listagem: GET /property?order=relevante&page=N  -> {"data":[...20 itens], "pagination":{page,total_items,max_pages}}
            (per_page/limit ignorados; 20/página com `page`; order=desagio embaralha entre páginas, relevante é estável). Filtros: tipo-venda=leilao|venda_direta, search=UF, vendedor=...
  Detalhe:  GET /property/<uuid|IDRxxxxx> -> tipo_de_venda, situacao (Ocupado), uf, matricula/rgi, areas, imagens,
            documents (matrícula/edital PDF), call_to_action_url (página do leiloeiro), formas_pagamento,
            consideracoes_importantes, despesas/dividas.
  Rate limit: após ~100 listagens + ~150 detalhes em 4 threads o gateway passou a devolver 403 Forbidden por vários
  minutos (bloqueio por IP). Por isso 2 threads, 0.6s entre chamadas e pausa de 45s/90s/135s em 403.
  Só `status_da_venda == "ativo"`. O mesmo backend serve os white-labels (ex.: emgeaimoveis.com.br -> emgea.py).

Modalidade: tipo_de_venda "Leilão" -> extrajudicial (leilão do credor fiduciário; "judicial" se o texto disser),
"Venda direta"/"Proposta" -> venda_direta. lance_minimo = valores.valor_venda (label "Lance mínimo"/"Valor de venda").
"""
import re, sys, os, time
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import session, city, tipo, desagio, flags, now_iso, save_raw

CFG = {
    "fonte": "resale",
    "base": "https://q3jhhgksa9.execute-api.us-east-2.amazonaws.com/prod",
    "key": "TFqvYJxuhO67Bo5WOzspQ6UENhuIZFVvrhLIcCig",
    "origin": "https://www.resale.com.br",
    "site": "https://www.resale.com.br/imovel/",
}
THREADS = 2
MAX = int(os.environ.get("GARIMPO_MAX", "0") or 0)
MAX_PAGES = int(os.environ.get("GARIMPO_PAGES", "0") or 0)

def _log(fonte, *a):
    print(f"[{fonte}]", *a, file=sys.stderr)

def _session(cfg):
    s = session()
    s.headers.update({"X-API-KEY": cfg["key"], "Origin": cfg["origin"], "Referer": cfg["origin"] + "/",
                      "Accept": "application/json"})
    return s

def _get_json(s, cfg, path, params=None, tries=3):
    for i in range(tries):
        try:
            r = s.get(cfg["base"] + path, params=params, timeout=40)
            if r.status_code == 200:
                return r.json()
            _log(cfg["fonte"], f"HTTP {r.status_code} {path} {params or ''}")
            if r.status_code == 500 and i == tries - 1: return None
            if r.status_code == 403:  # WAF/quota do API Gateway: bloqueia o IP por alguns minutos
                time.sleep(45 * (i + 1)); continue
        except Exception as e:
            _log(cfg["fonte"], f"erro {e} {path}")
        time.sleep(1.5 * (i + 1))
    return None

def _iso(t):
    m = re.search(r"(\d{2})/(\d{2})/(\d{4})", str(t or ""))
    return f"{m.group(3)}-{m.group(2)}-{m.group(1)}" if m else None

def _list(s, cfg):
    out, page, last = {}, 1, None
    while True:
        d = _get_json(s, cfg, "/property", {"order": "relevante", "page": page})
        if not d or not isinstance(d.get("data"), list): break
        for x in d["data"]:
            k = x.get("id_do_imovel") or x.get("id")
            if k: out.setdefault(k, x)
        pg = d.get("pagination") or {}
        if last is None:
            last = int(pg.get("max_pages") or 1)
            _log(cfg["fonte"], f"listagem: total_items={pg.get('total_items')} páginas={last}")
        if page % 25 == 0 or page >= last: _log(cfg["fonte"], f"página {page}/{last}: {len(out)} únicos")
        if not d["data"] or page >= last or (MAX_PAGES and page >= MAX_PAGES): break
        page += 1
        time.sleep(0.6)
    return list(out.values())

def _num(v):
    try:
        v = float(v)
        return v if v > 0 else None
    except (TypeError, ValueError):
        return None

def _area(d, *keys):
    for k in keys:
        a = (d.get("areas") or {}).get(k) or d.get(k) or {}
        v = _num(a.get("value") if isinstance(a, dict) else a)
        if v: return v
    return None

def _build(cfg, x, d):
    d = d or {}
    fonte = cfg["fonte"]
    code = x.get("id_do_imovel") or d.get("id_do_imovel") or x.get("id")
    vals = d.get("valores") or x.get("valores") or {}
    lance = _num(vals.get("valor_venda")) or _num(vals.get("valor_a_vista"))
    if not lance: return None
    aval = _num(vals.get("valor_avaliado")) or lance
    tv = (d.get("tipo_de_venda") or "").lower() or " ".join(x.get("tags") or []).lower()
    desc = d.get("descricao") or x.get("descricao") or ""
    cons = d.get("consideracoes_importantes") or ""
    extra = d.get("consideracoes_extra") or ""
    if "leil" in tv:
        modalidade = "judicial" if re.search(r"(?i)leil[ãa]o judicial|hasta p[úu]blica", desc + " " + extra) else "extrajudicial"
    elif "direta" in tv or "proposta" in tv: modalidade = "venda_direta"
    else: modalidade = "outro"
    end = d.get("endereco") or x.get("endereco") or {}
    full = end.get("endereco_completo") or ""
    parts = [p.strip() for p in full.split(",")]
    cep = re.search(r"\d{5}-?\d{3}", full)
    uf = (d.get("uf") or end.get("uf") or end.get("estado") or "").upper()
    if not uf and len(parts) >= 2 and re.fullmatch(r"[A-Z]{2}", parts[-2]): uf = parts[-2]
    cid = end.get("cidade") or d.get("cidade") or (parts[-3] if len(parts) >= 3 else "")
    bairro = None
    if len(parts) >= 4: bairro = parts[-4].split("/")[0].strip()
    titulo = d.get("imovel_name") or x.get("nome_imovel") or ""
    tt = tipo(d.get("tipo_imovel") or x.get("tipo_imovel") or "")
    if tt == "outro":
        fin = (d.get("finalidade") or "").lower()
        ti = (d.get("tipo_imovel") or x.get("tipo_imovel") or "").lower()
        if "rural" in fin or ti in ("fazenda", "area", "área", "chacara_sitio"): tt = "rural"
        elif ti in ("area", "área") or "lote" in ti: tt = "terreno"
        else: tt = tipo(titulo)
    car = d.get("caracteristicas") or x.get("caracteristicas") or {}
    sit = (d.get("situacao") or "").lower() or " ".join(x.get("tags") or []).lower()
    ocup = False if "desocupad" in sit else (True if "ocupad" in sit else None)
    docs = d.get("documents") or []
    edital = next((z["url"] for z in docs if re.search(r"(?i)edital", z.get("nome") or "") and z.get("url")), None)
    matr_url = next((z["url"] for z in docs if re.search(r"(?i)matr", (z.get("nome") or "") + (z.get("category_id") or "")) and z.get("url")), None)
    fotos = [i["url"] for i in sorted(d.get("imagens") or [], key=lambda i: i.get("order", 0)) if i.get("url")]
    if not fotos and x.get("foto_capa"): fotos = [x["foto_capa"]]
    pag = " ".join(str(f) for f in (d.get("formas_pagamento") or [])).lower()
    deb = None
    for sent in re.split(r"(?<=[.;])\s+", cons + " " + extra):
        if re.search(r"(?i)d[ée]bito|iptu|condom", sent): deb = sent.strip()[:400]; break
    dt = _iso(d.get("data_limite") or x.get("data_melhor_proposta"))
    fl = flags(titulo + "\n" + desc + "\n" + extra)
    comp = ((d.get("carteira") or {}).get("quem_paga_comissao") or "")
    item = {
        "id": f"{fonte}:{code}",
        "fonte": fonte,
        "url": cfg["site"] + str(code),
        "tipo": tt,
        "titulo": titulo,
        "endereco": ", ".join(parts[:-4]) if len(parts) >= 5 else (parts[0] if parts and parts[0] else None),
        "bairro": bairro,
        "cidade": city(cid),
        "uf": uf,
        "cep": cep.group(0) if cep else None,
        "area_privativa_m2": _area(d, "area_privativa", "area_util", "area_construida", "area_total") if tt != "terreno" else None,
        "area_terreno_m2": _area(d, "area_terreno") or (_area(x, "area_terreno") if isinstance(x.get("area_terreno"), dict) else None),
        "quartos": int(car["dormitorios"]) if str(car.get("dormitorios") or "0").isdigit() and int(car["dormitorios"]) > 0 else None,
        "vagas": int(car["vagas_garagem"]) if str(car.get("vagas_garagem") or "0").isdigit() and int(car["vagas_garagem"]) > 0 else None,
        "avaliacao": aval,
        "lance_minimo": lance,
        "desagio_pct": desagio(aval, lance),
        "modalidade": modalidade,
        "praca": None,
        "data_leilao": dt if modalidade != "venda_direta" else None,
        "data_fim": dt,
        "ocupado": ocup,
        "leiloeiro": ((d.get("canal_atendimento") or {}).get("name")) or None,
        "leiloeiro_url": d.get("call_to_action_url") or None,
        "vendedor": ((d.get("vendedor") or x.get("vendedor") or {}).get("name")) or None,
        "matricula": (d.get("matricula") or None),
        "cartorio": (d.get("rgi") or None),
        "edital_url": edital,
        "matricula_url": matr_url,
        "fotos": fotos,
        "aceita_financiamento": True if "financ" in pag else None,
        "aceita_fgts": True if "fgts" in pag else None,
        "debitos_regra": deb,
        "debitos_por_conta_comprador": (True if (d.get("possui_dividas") == "sim") else None),
        "comissao_paga_por": comp or None,
        "direitos_fiduciante": fl["direitos_fiduciante"],
        "fracao_ideal": fl["fracao_ideal"],
        "descricao": (desc + ("\n\n" + extra if extra else ""))[:6000],
        "coletado_em": now_iso(),
    }
    return {k: v for k, v in item.items() if v is not None or k in ("praca", "ocupado", "data_leilao")}

def collect_from(cfg):
    fonte = cfg["fonte"]
    s = _session(cfg)
    cards = [c for c in _list(s, cfg) if (c.get("status_da_venda") or "ativo") == "ativo"]
    if MAX: cards = cards[:MAX]
    _log(fonte, f"{len(cards)} imóveis ativos; buscando detalhes...")
    items, seen = [], set()
    def work(x):
        try:
            d = _get_json(s, cfg, "/property/" + str(x.get("id_do_imovel") or x.get("id")))
            time.sleep(0.6)
            d = (d or {}).get("data", d) if isinstance(d, dict) else None
            if isinstance(d, dict) and d.get("status_da_venda") not in (None, "ativo"): return None
            return _build(cfg, x, d if isinstance(d, dict) else None)
        except Exception as e:
            _log(fonte, f"falha {x.get('id_do_imovel')}: {e}")
            return None
    with ThreadPoolExecutor(THREADS) as ex:
        for i, it in enumerate(ex.map(work, cards), 1):
            if it and it["id"] not in seen:
                seen.add(it["id"]); items.append(it)
            if i % 200 == 0: _log(fonte, f"detalhes {i}/{len(cards)}")
    return items

def collect():
    return collect_from(CFG)

if __name__ == "__main__":
    save_raw(CFG["fonte"], collect())
