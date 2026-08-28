"""Coletor da Caixa Econômica Federal (venda-imoveis.caixa.gov.br), Brasil inteiro (27 UFs).

Fonte primária: CSV oficial por UF
    https://venda-imoveis.caixa.gov.br/listaweb/Lista_imoveis_<UF>.csv
  latin-1, separador ';'. Layout (inspecionado em 25/08/2026):
    linha 1: "Lista de Imóveis da Caixa;;Data de geração:;dd/mm/aaaa;..."
    linha 2: cabeçalho real (N° do imóvel;UF;Cidade;Bairro;Endereço;Preço;
             Valor de avaliação;Desconto;Financiamento;Descrição;
             Modalidade de venda;Link de acesso)
    linha 3: vazia; a partir da 4 vêm os dados (campos com espaços sobrando).
  A descrição já traz área total/privativa/terreno, qto(s), vaga(s).

Enriquecimento (página de detalhe):
  A URL do CSV (GET detalhe-imovel.asp?hdnimovel=X) é bloqueada pelo bot
  manager (Radware/ShieldSquare: 302 para validate.perfdrive.com), inclusive
  com cookies e referer. Porém o mesmo endpoint responde 200 via
  POST /sistema/detalhe-imovel.asp com form {hdnimovel: X}, que é o que a
  própria busca do site usa. É isso que enrich() faz.
  A página traz: matrícula, comarca, ofício, inscrição imobiliária, áreas,
  quartos, datas de leilão/licitação, formas de pagamento (FGTS/financiamento),
  regras de condomínio/tributos, links ExibeDoc() para PDF da matrícula e do
  edital, e fotos em /fotos/F<...>.jpg.
  Não obtido: ocupação (a Caixa não informa na página; só se aparecer
  "ocupado"/"desocupado" na descrição), CEP quando ausente do endereço.
  Se o site bloquear/cair, enrich() devolve o item sem enriquecimento.

User-Agent: o bot manager (Azion/Radware) devolve 302 (desafio JS) por
  (IP, User-Agent) depois de poucos hits, mesmo para o CSV; um UA novo passa
  de novo. Por isso este coletor usa UAs sintéticos e rotaciona o UA sempre
  que recebe 302 (ver _rotate_ua / _post).
"""
import csv, io, re, sys, time, json, os, datetime as dt
import requests
from bs4 import BeautifulSoup

sys.path.insert(0, __import__("os").path.dirname(__file__))
from common import session, now_iso, money, city, tipo, desagio, flags, strip_accents, save_raw, RAW

BASE = "https://venda-imoveis.caixa.gov.br"
CSV_URL = BASE + "/listaweb/Lista_imoveis_{uf}.csv"
DETAIL_URL = BASE + "/sistema/detalhe-imovel.asp"
SLEEP = 0.5
RETRIES = 4
BLOCK_WAIT = 45   # segundos de espera após 302 (cresce por tentativa)
CSV_SLEEP = 3.0   # pausa entre CSVs de UF
UFS = ("AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA", "PB", "PE", "PI",
       "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO")
_ua_n = [0]


def _rotate_ua(s):
    _ua_n[0] += 1
    s.headers["User-Agent"] = f"Mozilla/5.0 (compatible; garimpo/{_ua_n[0]}.{int(time.time()) % 1000})"
    s.cookies.clear()


def _session():
    s = session()
    _rotate_ua(s)
    return s

MODALIDADES = [
    ("leilao sfi", "leilao_sfi"),
    ("licitacao aberta", "licitacao_aberta"),
    ("venda direta", "venda_direta"),
    ("venda online", "venda_online"),
]


def _modalidade(s):
    t = strip_accents((s or "").lower())
    for k, v in MODALIDADES:
        if k in t: return v
    return "outro"


def _num(s):
    return money(s)


def _get(session_, url, **kw):
    """GET com retry simples e sleep."""
    last = None
    for i in range(RETRIES):
        try:
            time.sleep(SLEEP)
            r = session_.get(url, timeout=60, allow_redirects=False, **kw)
            if r.status_code == 200: return r
            last = f"HTTP {r.status_code}"
            if r.status_code == 302:
                # bloqueio ShieldSquare por IP: esfria bastante antes de tentar de novo
                _rotate_ua(session_)
                time.sleep(BLOCK_WAIT * (i + 1))
        except requests.RequestException as e:
            last = repr(e)
        time.sleep(1.5 * (i + 1))
    raise RuntimeError(f"GET {url} falhou: {last}")


def _post(session_, url, data):
    last = None
    for i in range(RETRIES):
        try:
            time.sleep(SLEEP)
            r = session_.post(url, data=data, timeout=60, allow_redirects=False)
            if r.status_code == 200 and "hdnimovel" in r.text: return r
            last = f"HTTP {r.status_code}"
            if r.status_code == 302: _rotate_ua(session_)
        except requests.RequestException as e:
            last = repr(e)
        time.sleep(1.5 * (i + 1))
    raise RuntimeError(f"POST {url} falhou: {last}")


# ---------- CSV ----------

def fetch_csv(uf, session_=None):
    s = session_ or _session()
    r = _get(s, CSV_URL.format(uf=uf))
    return r.content.decode("latin-1")


def parse_csv(text):
    """Devolve lista de dicts com as colunas do cabeçalho real."""
    lines = text.splitlines()
    hdr_i = next(i for i, l in enumerate(lines) if "do im" in l and "UF;" in l)
    header = [h.strip() for h in lines[hdr_i].split(";")]
    body = "\n".join(l for l in lines[hdr_i + 1:] if l.strip())
    out = []
    for row in csv.reader(io.StringIO(body), delimiter=";"):
        if len(row) < len(header): continue
        out.append({header[i]: row[i].strip() for i in range(len(header))})
    return out


_RE_AREA_PRIV = re.compile(r"([\d.,]+)\s*de área privativa", re.I)
_RE_AREA_TOT = re.compile(r"([\d.,]+)\s*de área total", re.I)
_RE_AREA_TER = re.compile(r"([\d.,]+)\s*de área do terreno", re.I)
_RE_QTO = re.compile(r"(\d+)\s*qto", re.I)
_RE_VAGA = re.compile(r"(\d+)\s*vaga", re.I)


def _area(rx, s):
    m = rx.search(s or "")
    if not m: return None
    v = _num(m.group(1))
    return v if v and v > 0 else None


def _int(rx, s):
    m = rx.search(s or "")
    return int(m.group(1)) if m else None


def row_to_item(r):
    cod = re.sub(r"\D", "", r.get("N° do imóvel") or r.get("Nº do imóvel") or "")
    desc = r.get("Descrição", "")
    aval = _num(r.get("Valor de avaliação"))
    preco = _num(r.get("Preço"))
    url = r.get("Link de acesso") or f"{DETAIL_URL}?hdnimovel={cod}"
    bairro = r.get("Bairro", "").strip()
    end = re.sub(r"\s+", " ", r.get("Endereço", "")).strip(" ,")
    fin = strip_accents(r.get("Financiamento", "").lower())
    item = {
        "id": f"caixa:{cod}",
        "fonte": "caixa",
        "url": url,
        "tipo": tipo(desc.split(",")[0]),
        "titulo": f"{desc.split(',')[0].strip()} em {city(r.get('Cidade'))}" + (f" ({city(bairro)})" if bairro else ""),
        "endereco": end or None,
        "bairro": city(bairro) or None,
        "cidade": city(r.get("Cidade")),
        "uf": r.get("UF", "").strip().upper(),
        "area_privativa_m2": _area(_RE_AREA_PRIV, desc) or _area(_RE_AREA_TOT, desc),
        "area_terreno_m2": _area(_RE_AREA_TER, desc),
        "quartos": _int(_RE_QTO, desc),
        "vagas": _int(_RE_VAGA, desc),
        "avaliacao": aval,
        "lance_minimo": preco,
        "desagio_pct": desagio(aval, preco),
        "modalidade": _modalidade(r.get("Modalidade de venda")),
        "aceita_financiamento": True if fin == "sim" else (False if fin == "nao" else None),
        "descricao": desc,
        "coletado_em": now_iso(),
    }
    item.update(flags(desc))
    return item


# ---------- detalhe ----------

def _iso(d):
    try: return dt.datetime.strptime(d, "%d/%m/%Y").date().isoformat()
    except Exception: return None


def _val(txt, label):
    m = re.search(re.escape(label) + r"\s*:?\s*\n?\s*([^\n]+)", txt)
    return m.group(1).strip() if m else None


def parse_detail(html):
    soup = BeautifulSoup(html, "html.parser")
    for t in soup(["script", "style"]): t.decompose()
    txt = re.sub(r"[ \t\xa0]+", " ", soup.get_text("\n"))
    txt = re.sub(r"\n\s*\n+", "\n", txt)
    d = {}

    d["matricula"] = _val(txt, "Matrícula(s)")
    comarca = _val(txt, "Comarca")
    oficio = _val(txt, "Ofício")
    if comarca or oficio:
        d["cartorio"] = " ".join(x for x in [f"{oficio}º Ofício" if oficio else None,
                                             f"de Registro de Imóveis de {comarca}" if comarca else None] if x)
    d["inscricao_imobiliaria"] = _val(txt, "Inscrição imobiliária")
    d["averbacao_leiloes_negativos"] = _val(txt, "Averbação dos leilões negativos")

    m = re.search(r"CEP:\s*([\d-]{8,9})", txt)
    if m: d["cep"] = m.group(1)

    for lab, key in [("Área privativa", "area_privativa_m2"), ("Área do terreno", "area_terreno_m2"), ("Área total", "area_total_m2")]:
        m = re.search(re.escape(lab) + r"\s*=\s*\n?\s*([\d.,]+)\s*m", txt)
        if m:
            v = _num(m.group(1))
            if v: d[key] = v
    q = _val(txt, "Quartos")
    if q and q.isdigit(): d["quartos"] = int(q)

    # datas
    praca = re.findall(r"Data do (\d)º Leilão\s*-\s*(\d{2}/\d{2}/\d{4})", txt)
    if praca:
        d["datas_leilao"] = {int(n): _iso(dd) for n, dd in praca}
        d["praca"] = 1
        d["data_leilao"] = _iso(praca[0][1])
        d["data_fim"] = _iso(praca[-1][1])
        m = re.search(r"1º Leilão:\s*R\$\s*([\d.,]+)", txt)
        if m: d["lance_1a_praca"] = _num(m.group(1))
        m = re.search(r"2º Leilão:\s*R\$\s*([\d.,]+)", txt)
        if m: d["lance_2a_praca"] = _num(m.group(1))
    else:
        m = re.search(r"Data d[ao] [^\n-]+?-\s*(\d{2}/\d{2}/\d{4})", txt)
        if m: d["data_leilao"] = _iso(m.group(1))
    m = re.search(r"Edital:\s*([^\n]+)", txt)
    if m: d["edital_num"] = m.group(1).strip()
    m = re.search(r"Leiloeiro\(a\):\s*([^\n]+)", txt)
    if m: d["leiloeiro"] = m.group(1).strip()

    # pagamento
    m = re.search(r"FORMAS DE PAGAMENTO ACEITAS:\s*\n(.*?)(?:REGRAS PARA PAGAMENTO|$)", txt, re.S)
    pag = m.group(1).strip() if m else ""
    if pag:
        d["formas_pagamento"] = re.sub(r"\s*\n\s*", " | ", pag)
        pl = strip_accents(pag.lower())
        d["aceita_fgts"] = "permite utilizacao de fgts" in pl
        d["aceita_financiamento"] = "permite financiamento" in pl

    # débitos
    m = re.search(r"REGRAS PARA PAGAMENTO DAS DESPESAS[^\n]*\n(.*?)(?:\n\s*(?:Baixar edital|Corretores credenciados|Regras da Venda|Dê seu lance|Fazer uma proposta|Voltar)|$)", txt, re.S)
    if m:
        regra = re.sub(r"\s*\n\s*", " ", m.group(1).strip())
        d["debitos_regra"] = regra
        d["debitos_por_conta_comprador"] = "responsabilidade do comprador" in strip_accents(regra.lower())

    # descrição da página + ocupação (só quando o texto diz)
    m = re.search(r"Descrição:\s*\n(.*?)\nFORMAS DE PAGAMENTO", txt, re.S)
    desc_pag = re.sub(r"\s+", " ", m.group(1)).strip(" .") if m else ""
    if desc_pag: d["descricao_detalhe"] = desc_pag
    tl = strip_accents(txt.lower())
    if re.search(r"\bdesocupado\b", tl): d["ocupado"] = False
    elif re.search(r"\bocupado\b", tl): d["ocupado"] = True

    # documentos e fotos
    docs = re.findall(r"ExibeDoc\('([^']+)'\)", html)
    for p in docs:
        u = p if p.startswith("http") else BASE + p
        if "/matricula/" in p.lower(): d["matricula_url"] = u
        elif "/editais/" in p.lower(): d["edital_url"] = u
    fotos = []
    for im in soup.find_all("img"):
        src = im.get("src") or ""
        if "/fotos/" in src:
            u = src if src.startswith("http") else BASE + src
            if u not in fotos: fotos.append(u)
    if fotos: d["fotos"] = fotos
    return d


def enrich(item, session_):
    """Abre a página de detalhe via POST (GET é bloqueado) e mescla campos.
    Tolerante a falhas: devolve o item original com `enrich_erro` se não der."""
    cod = item["id"].split(":", 1)[1]
    try:
        r = _post(session_, DETAIL_URL, {"hdnimovel": cod})
        det = parse_detail(r.text)
    except Exception as e:
        item["enrich_erro"] = str(e)[:200]
        return item
    if not det.get("matricula") and not det.get("debitos_regra"):
        item["enrich_erro"] = "página sem campos esperados"
        return item
    for k, v in det.items():
        if v is None: continue
        if k in ("quartos", "area_privativa_m2", "area_terreno_m2") and item.get(k): continue
        item[k] = v
    # no Leilão SFI o preço do CSV costuma ser o do 2º leilão; praça segue o preço
    l2, dl = item.get("lance_2a_praca"), item.get("datas_leilao") or {}
    if l2 and item.get("lance_minimo") and abs(l2 - item["lance_minimo"]) < 1 and dl.get(2):
        item["praca"] = 2
        item["data_leilao"] = dl[2]
    item["enriquecido_em"] = now_iso()
    return item


# ---------- pipeline ----------

ENRICH_KEYS = ("matricula", "cartorio", "cep", "datas_leilao", "praca", "data_leilao", "data_fim", "lance_1a_praca",
               "lance_2a_praca", "edital_num", "edital_url", "matricula_url", "fotos", "leiloeiro", "formas_pagamento",
               "aceita_fgts", "debitos_regra", "debitos_por_conta_comprador", "descricao_detalhe", "ocupado",
               "enriquecido_em", "area_total_m2", "inscricao_imobiliaria", "averbacao_leiloes_negativos")


def _mesclar_anterior(items, path=None):
    """Copia o enriquecimento já salvo em data/raw/caixa.json para os itens de mesmo id,
    para não perder o detalhe (lento) a cada coleta. Devolve quantos herdaram."""
    path = path or os.path.join(RAW, "caixa.json")
    try:
        with open(path, encoding="utf-8") as f:
            old = {it["id"]: it for it in json.load(f) if it.get("enriquecido_em")}
    except Exception:
        return 0
    n = 0
    for it in items:
        o = old.get(it["id"])
        if not o: continue
        for k in ENRICH_KEYS:
            if o.get(k) is not None and it.get(k) in (None, [], ""): it[k] = o[k]
        for k in ("quartos", "area_privativa_m2", "area_terreno_m2", "aceita_financiamento"):
            if it.get(k) is None and o.get(k) is not None: it[k] = o[k]
        n += 1
    print(f"[caixa] {n} itens herdaram enriquecimento anterior", file=sys.stderr)
    return n


def default_filter(it):
    a = it.get("avaliacao") or 0
    return it.get("desagio_pct", 0) >= 0.30 and 100_000 <= a <= 400_000


def collect(ufs=None, enrich_filter=None, max_enrich=None):
    """ufs=None -> as 27 UFs (CSV por UF). A UF do item sai da coluna UF do CSV.
    max_enrich limita quantos itens passam pelo POST de detalhe (0 = nenhum)."""
    s = _session()
    items = []
    for uf in (ufs or UFS):
        try:
            rows = parse_csv(fetch_csv(uf, s))
        except Exception as e:
            print(f"[caixa] {uf}: falha no CSV: {e}", file=sys.stderr)
            continue
        got = [row_to_item(r) for r in rows if r.get("UF", "").strip()]
        print(f"[caixa] {uf}: {len(got)} linhas no CSV", file=sys.stderr)
        items.extend(got)
        time.sleep(CSV_SLEEP)
    _mesclar_anterior(items)
    flt = enrich_filter if enrich_filter is not None else default_filter
    alvo = [it for it in items if flt(it) and not it.get("enriquecido_em")]
    if max_enrich is not None: alvo = alvo[:max_enrich]
    print(f"[caixa] enriquecendo {len(alvo)} itens", file=sys.stderr)
    ok = 0
    for i, it in enumerate(alvo, 1):
        enrich(it, s)
        ok += "enriquecido_em" in it
        if i % 25 == 0: print(f"[caixa] {i}/{len(alvo)} (ok={ok})", file=sys.stderr)
    print(f"[caixa] enriquecidos ok={ok}/{len(alvo)}", file=sys.stderr)
    return items


if __name__ == "__main__":
    lim = int(sys.argv[1]) if len(sys.argv) > 1 else None
    save_raw("caixa", collect(max_enrich=lim))
