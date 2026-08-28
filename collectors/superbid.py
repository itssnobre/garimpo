"""Coletor Superbid Exchange (www.superbid.net), categoria Imóveis, Brasil inteiro.

Método: API JSON pública usada pelo próprio site (Next.js):
  GET https://offer-query.superbid.net/seo/offers/?...  (sem `filter`, vem nacional)
Pagina com pageNumber/pageSize (até 200 por página). Não exige token.
UF: product.location.state vem por extenso ("Minas Gerais") -> mapa UF_POR_NOME;
  quando ausente, usa o sufixo de product.location.city ("Santos - SP").

Limitações conhecidas:
- A API não expõe "valor de avaliação". Quando o lote traz a propriedade "Deságio" (%),
  a avaliação é derivada de lance / (1 - deságio). Quando há propriedade com "avalia" no
  nome, usa-se ela. Caso contrário avaliacao = lance_minimo (desagio 0).
- Judicial = auction.judicialPraca preenchido; praça vem de judicialPracaDescription.
- ocupado: propriedade "Situação" ou menção a (des)ocupado no texto.
"""
import re, sys, os, time, html
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import session, money, city, tipo, desagio, flags, now_iso, save_raw

BASE = "https://offer-query.superbid.net/seo/offers/"
PARAMS = {
    "locale": "pt_BR", "portalId": "[2,15]", "requestOrigin": "marketplace", "timeZoneId": "America/Sao_Paulo",
    "preOrderBy": "orderByFirstOpenedOffersAndSecondHasPhoto", "orderBy": "score:desc", "searchType": "opened",
    "urlSeo": "https://www.superbid.net/categorias/imoveis",
    "pageSize": 100,
}
PAGE_SIZE = 100
UF_POR_NOME = {
    "acre": "AC", "alagoas": "AL", "amazonas": "AM", "amapa": "AP", "bahia": "BA", "ceara": "CE", "distrito federal": "DF",
    "espirito santo": "ES", "goias": "GO", "maranhao": "MA", "minas gerais": "MG", "mato grosso do sul": "MS", "mato grosso": "MT",
    "para": "PA", "paraiba": "PB", "pernambuco": "PE", "piaui": "PI", "parana": "PR", "rio de janeiro": "RJ",
    "rio grande do norte": "RN", "rondonia": "RO", "roraima": "RR", "rio grande do sul": "RS", "santa catarina": "SC",
    "sergipe": "SE", "sao paulo": "SP", "tocantins": "TO",
}

def _uf(loc):
    from common import strip_accents
    st = strip_accents((loc.get("state") or "").strip().lower())
    if st in UF_POR_NOME: return UF_POR_NOME[st]
    cidade = loc.get("city") or ""
    m = re.search(r"[-/]\s*([A-Z]{2})\s*$", cidade)
    if m: return m.group(1)
    # sem state e cidade homônima do estado ("São Paulo", "Rio de Janeiro")
    return UF_POR_NOME.get(strip_accents(cidade.strip().lower()))

def _get(s, params, tries=3):
    for i in range(tries):
        try:
            r = s.get(BASE, params=params, timeout=30, headers={"Origin": "https://www.superbid.net", "Referer": "https://www.superbid.net/"})
            if r.status_code == 200:
                return r.json()
            print(f"[superbid] HTTP {r.status_code} p={params.get('pageNumber')}", file=sys.stderr)
        except Exception as e:
            print(f"[superbid] erro {e} p={params.get('pageNumber')}", file=sys.stderr)
        time.sleep(1.5 * (i + 1))
    return None

def _strip_html(t):
    t = re.sub(r"<br\s*/?>", "\n", t or "")
    t = re.sub(r"<[^>]+>", " ", t)
    return re.sub(r"[ \t]+", " ", html.unescape(t)).strip()

def _slug(t):
    from common import strip_accents
    t = strip_accents((t or "").lower())
    t = re.sub(r"[^a-z0-9]+", "-", t).strip("-")
    return t[:80] or "lote"

def _props(o):
    """Achata product.template.groups[].properties[] em {titulo_lower: valor}."""
    out = {}
    for g in ((o.get("product") or {}).get("template") or {}).get("groups") or []:
        for p in g.get("properties") or []:
            k = (p.get("title") or p.get("name") or "").strip().lower()
            v = p.get("value")
            if k and v not in (None, ""):
                out[k] = str(v).strip()
    return out

def _num(v):
    if v is None: return None
    v = str(v).replace("m²", "").replace("m2", "").strip()
    return money(v)

def _bool_in(v, yes, no):
    if not v: return None
    v = v.lower()
    if any(x in v for x in no): return False
    if any(x in v for x in yes): return True
    return None

def _item(o):
    p = o.get("product") or {}
    a = o.get("auction") or {}
    od = o.get("offerDetail") or {}
    props = _props(o)
    oid = o.get("id")
    short = (p.get("shortDesc") or "").strip()
    loc = p.get("location") or {}
    cid = (loc.get("city") or "").split(" - ")[0]
    uf = _uf(loc)
    if not uf:
        m = re.search(r"[-/,]\s*([A-Z]{2})\b", props.get("endereço") or props.get("endereco") or "")
        uf = m.group(1) if m else None
    if not uf:
        raise ValueError(f"sem UF (location={loc})")
    desc = _strip_html(p.get("detailedDescription") or (o.get("offerDescription") or {}).get("offerDescription") or "")

    lance = od.get("currentMinBid") or od.get("initialBidValue") or o.get("price")
    lance = float(lance) if lance else None
    aval = None
    for k, v in props.items():
        if "avalia" in k:
            aval = money(v); break
    if aval is None:
        # texto judicial costuma trazer "avaliado em R$ X" / "avaliação: R$ X"
        vals = [money(x) for x in re.findall(r"(?i)avalia(?:[çc][aã]o|d[oa])[^R$\n]{0,60}R\$\s*([\d\.]+,\d{2})", desc)]
        vals = [v for v in vals if v and lance and v >= lance]
        if vals: aval = max(vals)
    if aval is None and props.get("deságio"):
        d = money(props["deságio"])
        if d and 0 < d < 100 and lance:
            aval = round(lance / (1 - d / 100), 2)
    if aval is None:
        aval = lance

    venda = (props.get("tipo de venda") or "").lower()
    mod_desc = (a.get("modalityDesc") or "").lower()
    if "judicial" in venda or a.get("judicialPraca"):
        modalidade = "judicial"
    elif "direta" in venda or "tomada" in mod_desc or o.get("isShopping"):
        modalidade = "venda_direta"
    elif "leilao" in venda or "leilão" in mod_desc:
        modalidade = "extrajudicial"
    else:
        modalidade = "outro"

    praca = None
    pd = (a.get("judicialPracaDescription") or "").lower()
    m = re.search(r"(\d)", pd)
    if m: praca = int(m.group(1))
    elif "única" in pd or "unica" in pd: praca = 1

    subcat = ((p.get("subCategory") or {}).get("description") or "")
    cat = (((p.get("subCategory") or {}).get("category") or {}).get("description") or "")
    t = tipo(subcat)
    if t == "outro": t = tipo(cat)
    if t == "outro": t = tipo(short)

    endereco = props.get("endereço") or props.get("endereco")
    situacao = props.get("situação") or props.get("situacao") or ""
    ocupado = _bool_in(situacao + " " + short[:120], ["ocupado"], ["desocupado"])
    if ocupado is None:
        ocupado = _bool_in(desc[:3000], ["ocupado", "ocupada"], ["desocupado", "desocupada"])
    pagto = props.get("condições de pagamento") or props.get("condicoes de pagamento") or ""
    deb = props.get("responsabilidade do pagamento dos débitos") or props.get("responsabilidade do pagamento dos debitos")

    fotos = [g.get("link") for g in p.get("galleryJson") or [] if g.get("link")]
    edital = None
    for att in p.get("attachments") or []:
        if att.get("contentType") == "application/pdf" and "edital" in (att.get("originalFileName") or "").lower():
            edital = att.get("link"); break
    if not edital:
        for att in p.get("attachments") or []:
            if att.get("contentType") == "application/pdf":
                edital = att.get("link"); break

    end = (o.get("endDate") or a.get("endDate") or "")[:10] or None
    fl = flags(short + "\n" + desc)
    cep = None
    m = re.search(r"\b\d{5}-?\d{3}\b", endereco or "")
    if m: cep = m.group(0)

    item = {
        "id": f"superbid:{oid}",
        "fonte": "superbid",
        "url": f"https://www.superbid.net/oferta/{_slug(short)}-{oid}",
        "tipo": t,
        "titulo": short[:200],
        "endereco": endereco,
        "bairro": None,
        "cidade": city(cid),
        "uf": uf,
        "cep": cep,
        "area_privativa_m2": _num(props.get("área privativa") or props.get("área construída") or props.get("área útil")),
        "area_terreno_m2": _num(props.get("área do terreno") or props.get("área total")),
        "quartos": int(money(props["dormitórios"])) if props.get("dormitórios") and money(props["dormitórios"]) else None,
        "vagas": int(money(props["vagas"])) if props.get("vagas") and money(props["vagas"]) else None,
        "avaliacao": aval,
        "lance_minimo": lance,
        "desagio_pct": desagio(aval, lance),
        "modalidade": modalidade,
        "praca": praca,
        "data_leilao": end,
        "data_fim": end,
        "ocupado": ocupado,
        "aceita_financiamento": True if "financ" in pagto.lower() else (False if "vista" in pagto.lower() else None),
        "aceita_fgts": True if "fgts" in pagto.lower() else None,
        "debitos_regra": deb,
        "debitos_por_conta_comprador": _bool_in(deb, ["comprador", "arrematante"], ["vendedor", "comitente"]),
        "direitos_fiduciante": fl["direitos_fiduciante"],
        "fracao_ideal": fl["fracao_ideal"],
        "matricula": props.get("número da matrícula") or props.get("matrícula"),
        "cartorio": props.get("cartório") or props.get("cartorio"),
        "edital_url": edital,
        "matricula_url": None,
        "fotos": fotos,
        "descricao": desc[:6000],
        "coletado_em": now_iso(),
    }
    return {k: v for k, v in item.items() if v is not None or k in ("praca", "ocupado", "data_leilao")}

def collect():
    s = session()
    items, page, total = [], 1, None
    while True:
        params = dict(PARAMS, pageNumber=page, pageSize=PAGE_SIZE)
        d = _get(s, params)
        if not d:
            break
        offers = d.get("offers") or []
        total = d.get("total", total)
        for o in offers:
            try:
                if (o.get("offerStatus") or {}).get("closed"):
                    continue
                items.append(_item(o))
            except Exception as e:
                print(f"[superbid] falha no lote {o.get('id')}: {e}", file=sys.stderr)
        print(f"[superbid] página {page}: {len(offers)} lotes (total {total})", file=sys.stderr)
        if not offers or len(items) >= (total or 0) or len(offers) < PAGE_SIZE:
            break
        page += 1
        time.sleep(0.5)
    return items

if __name__ == "__main__":
    save_raw("superbid", collect())
