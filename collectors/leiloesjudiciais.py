"""Coletor Leilões Judiciais Serrano (www.leiloesjudiciais.com.br), Brasil inteiro.

Método: API JSON pública do site (Nuxt 3 consumindo https://api.leiloesjudiciais.com.br/, sem token).
  Lotes:   POST core/api/get-lotes?tipo=3&pg=N&qtd_por_pagina=200&estado=0&cidade=0&...  (tipo 3 = Imóveis;
           ~1.470 lotes em 8 páginas; cada item traz descrição HTML, cidade/UF, valores, fotos, anexos PDF).
  Leilões: GET core/api/get-leiloes?pg=N&ativo=true&ordenacao=crescente (40/página) -> mapa leilao_id ->
           modalidade (nm_statusleilao), praças ("datas": Encerramento 1/2 = praças, Ciclo = venda direta),
           vara (descrição do leilão). Leilão ausente do ativo é buscado por &leilao_id=X.
  URL do lote: https://www.leiloesjudiciais.com.br/lote/{leilao_id}/{lote_id}

Semântica dos valores (conferida na UI do lote):
  vl_lanceminimo = AVALIAÇÃO (rótulo "Avaliação" na página), vl_lanceinicial = lance mínimo da 1ª praça,
  vl_lanceinicialsegundoleilao = lance mínimo da 2ª praça, vl_lance = maior lance atual (se houver).

Limitações:
- Só lotes "Aberto para Lance" (statuslote_id 1); encerrados/vendidos não vêm na listagem.
- Endereço/bairro/área/quartos/matrícula/processo saem por regex da descrição (nem sempre presentes).
- Lotes onde a avaliação é oculta (bn_exibeavaliacao false / valor 0) usam o lance como avaliação.
"""
import re, sys, os, time, html
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import session, money, city, tipo, desagio, flags, now_iso, save_raw, strip_accents

FONTE = "leiloesjudiciais"
API = "https://api.leiloesjudiciais.com.br/core/api/"
SITE = "https://www.leiloesjudiciais.com.br"
PAGE = 200
MAX = int(os.environ.get("GARIMPO_MAX", "0") or 0)
UFS = {"AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"}

def _req(s, path, params, method="GET", tries=3):
    for i in range(tries):
        try:
            r = s.request(method, API + path, params=params, timeout=60)
            if r.status_code == 200:
                return r.json()
            print(f"[{FONTE}] HTTP {r.status_code} {path}", file=sys.stderr)
        except Exception as e:
            print(f"[{FONTE}] erro {e} {path}", file=sys.stderr)
        time.sleep(1.5 * (i + 1))
    return None

def _lotes(s):
    out, pg, total = [], 1, None
    while True:
        p = {"pg": pg, "qtd_por_pagina": PAGE, "tipo": 3, "estado": 0, "cidade": 0, "valor_min": 0, "valor_max": 0,
             "palavra_chave": "", "leilao_id": 0, "lote_id": 0, "ordenacao": "crescente", "ehvitrinesaladisputa": "false",
             "faixa_desconto": 0, "com_foto": 0, "categoria": ""}
        d = _req(s, "get-lotes", p, "POST")
        if not d: break
        items = d.get("items") or []
        out.extend(items)
        if total is None: total = int(d.get("totalPages") or 1)
        print(f"[{FONTE}] lotes página {pg}/{total}: {len(items)}", file=sys.stderr)
        if not items or pg >= total or (MAX and len(out) >= MAX): break
        pg += 1
        time.sleep(0.5)
    return out

def _leiloes(s, ids):
    m = {}
    pg, total = 1, None
    while True:
        d = _req(s, "get-leiloes", {"pg": pg, "ativo": "true", "ordenacao": "crescente"})
        if not d: break
        for l in d.get("items") or []: m[int(l["id"])] = l
        if total is None: total = int(d.get("totalPages") or 1)
        if pg >= total: break
        pg += 1
        time.sleep(0.4)
    print(f"[{FONTE}] {len(m)} leilões ativos carregados", file=sys.stderr)
    missing = [i for i in ids if i not in m]
    for i in missing:
        d = _req(s, "get-leiloes", {"pg": 1, "ativo": "true", "ordenacao": "crescente", "leilao_id": i})
        for l in (d or {}).get("items") or []: m[int(l["id"])] = l
        time.sleep(0.3)
    if missing: print(f"[{FONTE}] {len(missing)} leilões buscados individualmente", file=sys.stderr)
    return m

def _text(h):
    t = re.sub(r"<br\s*/?>|</(p|div|li|tr)>", "\n", h or "", flags=re.I)
    t = html.unescape(re.sub(r"<[^>]+>", " ", t))
    t = re.sub(r"[ \t\xa0]+", " ", t)
    return re.sub(r"\n\s*\n+", "\n", t).strip()

def _num(v):
    try:
        f = float(v)
        return f if f > 0 else None
    except (TypeError, ValueError):
        return None

def _date(v):
    m = re.search(r"(\d{4})-(\d{2})-(\d{2})", v or "")
    if m: return m.group(0)
    m = re.search(r"(\d{2})/(\d{2})/(\d{4})", v or "")
    return f"{m.group(3)}-{m.group(2)}-{m.group(1)}" if m else None

def _tipo(sub, titulo):
    t = strip_accents((sub or "").lower())
    if "industri" in t or "deposito" in t or "galp" in t: return "comercial"
    if "agroindustr" in t or "fazenda" in t or "sitio" in t or "chacara" in t: return "rural"
    if "vaga" in t or "box" in t or "garagem" in t: return "outro"
    x = tipo(sub)
    return x if x != "outro" else tipo(titulo)

def _modalidade(leilao, desc):
    st = strip_accents((leilao or {}).get("nm_statusleilao") or "").lower()
    if "extrajudicial" in st: return "extrajudicial"
    if "judicial" in st or "alienacao" in st: return "judicial"
    if "venda direta" in st: return "venda_direta"
    d = strip_accents(desc.lower())
    if re.search(r"\bproc(esso|\.)|\bvara\b|justica (estadual|federal|do trabalho)", d): return "judicial"
    if "extrajudicial" in d: return "extrajudicial"
    return "outro"

def _praca(leilao):
    """Praça vigente: compara a data atual do leilão (dt) com as datas rotuladas 'Encerramento 1/2'."""
    if not leilao: return None
    if leilao.get("leilao_id_primeiroleilao"): return 2
    cur = (leilao.get("dt") or "")[:16]
    for x in leilao.get("datas") or []:
        if (x.get("dt") or "")[:16] == cur and x.get("statusrotuloleilao_multiplas") in (3, 4):
            return int(x.get("nu_ordemrotulo") or 1)   # 3 = Encerramento 1/2 (praças), 4 = leilão único
    return None   # data atual é um "Ciclo" (venda direta pós-praças) ou sem rótulo

def _build(lote, leilao):
    desc = _text(lote.get("nm_descricao"))
    titulo = re.sub(r"\s+", " ", lote.get("nm_titulo_lote") or "").strip()
    uf = (lote.get("nm_estado") or "").strip().upper()
    cid = lote.get("nm_cidade") or ""
    if uf not in UFS:
        m = re.search(r"([A-Za-zÀ-ÿ' .-]+?)\s*/\s*([A-Z]{2})\b", titulo)
        if m and m.group(2) in UFS: uf, cid = m.group(2), cid or m.group(1)
    if uf not in UFS:
        ufs = (leilao or {}).get("uf") or []
        if len(ufs) == 1: uf = ufs[0]
    if uf not in UFS: return None
    if re.search(r"simula[çc][ãa]o|\bteste\b", titulo, re.I): return None   # lotes de teste da plataforma
    if not cid:
        m = re.search(r"em\s+([A-ZÀ-Ü][\wÀ-ÿ' .-]+?)\s*/\s*" + uf, desc)
        if m: cid = m.group(1)

    aval = _num(lote.get("vl_lanceminimo"))
    l1 = _num(lote.get("vl_lanceinicial"))
    l2 = _num(lote.get("vl_lanceinicialsegundoleilao"))
    praca = _praca(leilao)
    base = l2 if (praca == 2 and l2) else l1
    atual = _num(lote.get("vl_lance"))
    lance = max(atual, base) if atual and base else (atual or base)
    if not lance: return None
    if not aval or not lote.get("bn_exibeavaliacao", True):
        m = re.search(r"avalia[çc][ãa]o[^\dR]{0,30}R\$\s*([\d.]+,\d{2})", desc, re.I)
        aval = money(m.group(1)) if m else None
    if not aval or aval < lance: aval = max(aval or 0, l1 or 0, lance)

    low = strip_accents(desc.lower())
    ocupado = None
    if re.search(r"\bdesocupad", low): ocupado = False
    elif re.search(r"\bocupad", low): ocupado = True
    mat = re.search(r"(?:matr[ií]cula\(?s?\)?|CRI[^\d\n]{0,40}sob)\s*(?:n?[º°o.]*\s*)?([\d][\d.]{2,})", desc, re.I)
    cart = re.search(r"(\d{1,2}\s*[º°]?\s*(?:CRI|Of[ií]cio|Cart[óo]rio|Registro de Im[óo]veis)[^.,;()\n]{0,60})", desc)
    if not cart: cart = re.search(r"(CRI\s+(?:de|local de|local)\s+[A-ZÀ-Ü][\wÀ-ÿ' ]+/[A-Z]{2})", desc)
    proc = re.search(r"proc(?:esso)?\.?\s*(?:n?[º°o.]*\s*)?(\d{4,7}-?\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})", desc, re.I)
    ldesc = _text((leilao or {}).get("nm_descricao"))
    vara = re.search(r"(\d{1,2}\s*ª\s*vara[^.)\n|]{0,60}|vara\s+[úu]nica[^.)\n|]{0,40})", desc, re.I) or \
           re.search(r"(\d{1,2}\s*ª\s*vara[^.)\n|]{0,60}|vara\s+[úu]nica[^.)\n|]{0,40})", ldesc, re.I)
    area = re.search(r"[áa]rea\s+(?:privativa|[úu]til)[^\d\n]{0,25}?([\d.]+,\d+|\d[\d.]*)\s*m[²2]", desc, re.I) or \
           re.search(r"[áa]rea\s+(?:constru[ií]da|total)?[^\d\n]{0,25}?([\d.]+,\d+|\d[\d.]*)\s*m[²2]", desc, re.I)
    ha = re.search(r"([\d.]+,\d+|\d[\d.]*)\s*(?:ha\b|hectares?)", desc, re.I)
    terr = re.search(r"(?:terreno|lote)[^\d\n]{0,40}?([\d.]+,\d+|\d[\d.]*)\s*m[²2]", desc, re.I)
    quartos = re.search(r"(\d{1,2})\s*(?:quartos?|dormit[óo]rios?|dorms?\b)", desc, re.I)
    vagas = re.search(r"(\d{1,2})\s*vagas?", desc, re.I)
    end = re.search(r"((?:Rua|Avenida|Av\.|Alameda|Travessa|Estrada|Rodovia|Pra[çc]a|Largo)\s+[^,;\n]{3,80}(?:,\s*(?:n[º°.]?\s*)?[\dA-Za-z/-]{1,8})?)", desc)
    bairro = re.search(r"bairro\s+([A-ZÀ-Ü][\wÀ-ÿ' .]{2,40}?)(?:,|\.|;|\n| em | -)", desc, re.I)
    cep = re.search(r"\bCEP:?\s*(\d{5}-?\d{3})", desc, re.I)

    tt = _tipo(lote.get("nm_subcategoria"), titulo)
    fl = flags(titulo + "\n" + desc)
    anexos = lote.get("anexos") or []
    def anexo(k):
        for a in anexos:
            if k in strip_accents((a.get("nm") or "").lower()): return a.get("nm_path_completo")
        return None
    fotos = []
    for f in lote.get("fotos") or []:
        if f.get("nm_path") and f.get("nm_path_incompleto"):
            fotos.append(f["nm_path_incompleto"] + "640x480/" + f["nm_path"])
    low_all = strip_accents((desc + "\n" + ldesc).lower())
    deb = None
    m = re.search(r"[^.;\n]*d[ée]bitos?[^.;\n]{0,300}", desc, re.I)
    if m and re.search(r"(?i)iptu|condom", m.group(0)): deb = m.group(0).strip()
    tarea = money(area.group(1)) if area else None
    a_terr = money(terr.group(1)) if terr else (round(money(ha.group(1)) * 10000, 2) if ha and money(ha.group(1)) else None)
    item = {
        "id": f"{FONTE}:{lote['lote_id']}",
        "fonte": FONTE,
        "url": f"{SITE}/lote/{lote['leilao_id']}/{lote['lote_id']}",
        "tipo": tt,
        "titulo": titulo,
        "endereco": end.group(1).strip() if end else None,
        "bairro": city(bairro.group(1)) if bairro else None,
        "cep": cep.group(1) if cep else None,
        "cidade": city(cid),
        "uf": uf,
        "area_privativa_m2": tarea if tt in ("apartamento", "casa", "comercial") else None,
        "area_terreno_m2": a_terr if a_terr else (tarea if tt in ("terreno", "rural") else None),
        "quartos": int(quartos.group(1)) if quartos else None,
        "vagas": int(vagas.group(1)) if vagas else None,
        "avaliacao": aval,
        "lance_minimo": lance,
        "desagio_pct": desagio(aval, lance),
        "modalidade": _modalidade(leilao, desc + "\n" + ldesc),
        "praca": praca,
        # dt_fechamento do lote fica defasado quando o leilão avança de praça; a data vigente é a do leilão
        "data_leilao": _date((leilao or {}).get("dt")) or _date(lote.get("dt_fechamento")),
        "data_fim": _date((leilao or {}).get("dt")) or _date(lote.get("dt_fechamento")),
        "lance_1a_praca": l1,
        "lance_2a_praca": l2,
        "leiloeiro": lote.get("nm_leiloeiro") or None,
        "processo": proc.group(1) if proc else None,
        "vara": re.sub(r"\s+", " ", vara.group(1)).strip() if vara else None,
        "matricula": mat.group(1).rstrip(".") if mat else None,
        "cartorio": re.sub(r"\s+", " ", cart.group(1)).strip() if cart else None,
        "ocupado": ocupado,
        "aceita_financiamento": True if "financ" in low_all else None,
        "aceita_fgts": True if "fgts" in low_all else None,
        "debitos_regra": deb,
        "debitos_por_conta_comprador": (True if re.search(r"(arrematante|comprador)", deb, re.I) and not re.search(r"(vendedor|comitente|quitad|sub-?rog)", deb, re.I)
                                        else (False if re.search(r"(vendedor|comitente|quitad|sub-?rog)", deb, re.I) else None)) if deb else None,
        "direitos_fiduciante": fl["direitos_fiduciante"],
        "fracao_ideal": fl["fracao_ideal"],
        "edital_url": anexo("edital"),
        "matricula_url": anexo("matricula"),
        "laudo_url": anexo("avalia") or anexo("laudo"),
        "fotos": fotos,
        "descricao": desc[:6000],
        "coletado_em": now_iso(),
    }
    return {k: v for k, v in item.items() if v is not None or k in ("praca", "ocupado", "data_leilao")}

def collect():
    s = session()
    lotes = _lotes(s)
    ativos = [l for l in lotes if str(l.get("statuslote_id")) == "1" or "abert" in (l.get("nm_statuslote") or "").lower()]
    if MAX: ativos = ativos[:MAX]
    print(f"[{FONTE}] {len(ativos)} lotes ativos de {len(lotes)} (Brasil)", file=sys.stderr)
    leiloes = _leiloes(s, sorted({int(l["leilao_id"]) for l in ativos}))
    items, seen = [], set()
    for l in ativos:
        try:
            it = _build(l, leiloes.get(int(l["leilao_id"])))
        except Exception as e:
            print(f"[{FONTE}] falha lote {l.get('lote_id')}: {e}", file=sys.stderr)
            it = None
        if it and it.get("cidade") and it["id"] not in seen:
            seen.add(it["id"]); items.append(it)
    return items

if __name__ == "__main__":
    save_raw(FONTE, collect())
