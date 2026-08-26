"""Coletor Frazão Leilões (https://www.frazaoleiloes.com.br), imóveis em SP.

Método (site ASP.NET MVC, sem API JSON pública):
  1. Listagem: GET /Sale/SearchLotResult?uf=SP&loteAtivo=true&start=N&limit=20&page=P
     (mesmo endpoint que o JS SearchLotResult.min.js chama via ajax). Retorna um
     fragmento HTML com os cards e o atributo total="N" para paginar. Cada card
     traz id do lote, url, tipo, endereço, área útil, datas de 1º/2º leilão e
     valores. O filtro uf=SP já retorna só imóveis (casa/apto/terreno/comercial).
  2. Detalhe: GET /lote/<id>-<slug> (HTML). Traz descrição, status, ocupação,
     endereço completo, fotos (carousel-photos), processo (judicial), e para
     lotes Santander um bloco "Valor Avaliado".
  3. Documentos: GET /Sale/LotDocs?loteId=<id>&leilaoId=<bid> (fragmento HTML
     com os PDFs: edital, matrícula etc.).

Limitações: lotes Itaú e a maioria dos judiciais não expõem valor de avaliação
na página; nesses casos avaliacao recebe o lance da 1ª praça (se houver 1º/2º
leilão) ou, em último caso, o próprio lance mínimo (desagio_pct = 0).
"""
import re, sys, os, time, html as htmlmod, datetime as dt
from bs4 import BeautifulSoup

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import session, money, city, tipo, desagio, flags, now_iso, save_raw

BASE = "https://www.frazaoleiloes.com.br"
LIST = BASE + "/Sale/SearchLotResult"
PAGE = 20
SKIP_STATUS = ("ENCERRADO", "RETIRADO", "CANCELADO", "SUSPENSO")

S = session()
S.headers.update({"X-Requested-With": "XMLHttpRequest", "Referer": BASE + "/leiloes"})


def get(url, params=None, tries=3, timeout=30):
    for i in range(tries):
        try:
            r = S.get(url, params=params, timeout=timeout)
            if r.status_code == 200:
                return r.text
            print(f"[frazao] HTTP {r.status_code} {url}")
        except Exception as e:
            print(f"[frazao] erro {url}: {e}")
        time.sleep(1.0 * (i + 1))
    return None


def money_any(s):
    """Aceita 'R$ 1.234,56', '1,234.56', '$1,732,000.00'."""
    if s is None: return None
    s = str(s).strip()
    if re.search(r"\d,\d{3}(\.\d{2})?$", s) and not re.search(r"\.\d{3},", s):
        v = re.sub(r"[^\d.]", "", s)
        try: return float(v)
        except ValueError: return None
    return money(s)


def num_br(s):
    if not s: return None
    m = re.search(r"(\d{1,3}(?:\.\d{3})*(?:,\d+)?|\d+(?:[.,]\d+)?)", s)
    if not m: return None
    v = m.group(1)
    if "," in v: v = v.replace(".", "").replace(",", ".")
    elif v.count(".") == 1 and len(v.split(".")[1]) <= 2: pass
    else: v = v.replace(".", "")
    try: return float(v)
    except ValueError: return None


def iso_date(s):
    m = re.search(r"(\d{2})/(\d{2})/(\d{4})", s or "")
    return f"{m.group(3)}-{m.group(2)}-{m.group(1)}" if m else None


def txt(el):
    return re.sub(r"\s+", " ", el.get_text(" ", strip=True)) if el else ""


# ---------------------------------------------------------------- listagem
def parse_card(card):
    a = card.select_one("a.visualizar_lote") or card.select_one("a[href^='/lote/']")
    if not a: return None
    href = a.get("href", "")
    m = re.search(r"/lote/(\d+)", href)
    if not m: return None
    item = {"id_fonte": m.group(1), "url": BASE + href, "tipo_raw": a.get("data-tipo", ""),
            "endereco": htmlmod.unescape(a.get("data-addr", "") or "")}
    b = card.select_one(".lot-title-cap b")
    item["titulo"] = (b.get("title") or txt(b)) if b else ""
    st = card.select_one(".label-md")
    item["status"] = txt(st).upper()
    area = card.select_one(".lot-area-cap span")
    item["area_util"] = num_br(txt(area)) if area else None
    img = card.select_one(".photo-lot img")
    item["foto_capa"] = img.get("src") if img else None
    logo = card.select_one(".comitente-logo-ico")
    item["vendedor"] = htmlmod.unescape(logo.get("alt", "")).replace("Logo ", "") if logo else ""
    # datas / valores das praças
    cal = card.select_one(".inf-leilao-calendar")
    pracas = []
    if cal:
        for d in cal.find_all("div", recursive=False):
            t = txt(d)
            md = re.search(r"(\d{2}/\d{2}/\d{4})", t)
            mv = re.search(r"R\$\s*([\d.,]+)", t)
            if md:
                pracas.append({"data": iso_date(md.group(1)), "valor": money(mv.group(1)) if mv else None,
                               "num": 2 if "2º" in t else 1})
    item["pracas"] = pracas
    return item


def list_lots():
    out, start, total = [], 0, None
    while True:
        params = {"uf": "SP", "start": start, "limit": PAGE, "page": start // PAGE + 1,
                  "loteAtivo": "true", "ExibirInternosPrimeiro": "true"}
        h = get(LIST, params)
        if h is None:
            print(f"[frazao] falha na listagem start={start}"); break
        m = re.search(r'total="(\d+)"', h)
        if total is None:
            total = int(m.group(1)) if m else 0
            print(f"[frazao] total na fonte (SP, ativos): {total}")
        soup = BeautifulSoup(h, "html.parser")
        cards = soup.select("#card-lote, [id='card-lote']")
        if not cards: break
        for c in cards:
            it = parse_card(c)
            if it: out.append(it)
        start += PAGE
        if start >= total: break
        time.sleep(0.5)
    # dedup
    seen, uniq = set(), []
    for it in out:
        if it["id_fonte"] in seen: continue
        seen.add(it["id_fonte"]); uniq.append(it)
    return uniq


# ---------------------------------------------------------------- detalhe
def parse_detail(h, item):
    soup = BeautifulSoup(h, "html.parser")
    d = {}
    h1 = soup.select_one("h1.lot-title")
    if h1: d["titulo"] = h1.get("title") or txt(h1)
    h2 = soup.select_one("h2.lot-subtitle")
    if h2:
        parts = [p.strip() for p in txt(h2).split(",") if p.strip()]
        if len(parts) >= 2 and re.fullmatch(r"[A-Z]{2}", parts[-1]):
            d["uf"] = parts[-1]
            d["cidade"] = parts[-2]
            if len(parts) >= 4: d["bairro"] = parts[-3]
            d["endereco"] = ", ".join(parts[:-2]) if len(parts) > 2 else parts[0]
    # descrição (card da coluna esquerda)
    desc_el = soup.select_one(".col-lg-8 .card")
    if desc_el:
        for br in desc_el.find_all("br"): br.replace_with("\n")
        for p in desc_el.find_all(["p", "div", "li"]): p.append("\n")
        raw = htmlmod.unescape(desc_el.get_text(" "))
        lines = [re.sub(r"[ \t\xa0]+", " ", l).strip() for l in raw.split("\n")]
        d["descricao"] = "\n".join(l for l in lines if l)[:6000]
    else:
        d["descricao"] = ""
    texto = re.sub(r"\s+", " ", d["descricao"])
    # ocupação
    head = txt(soup.select_one(".label-grey.row") or soup.new_tag("i"))
    tt = (head + " " + (d.get("titulo") or "") + " " + texto[:400]).lower()
    if "desocupado" in tt: d["ocupado"] = False
    elif "ocupado" in tt: d["ocupado"] = True
    # status / praças / lance na coluna direita
    st = soup.select_one(".lot-status")
    d["status"] = txt(st).upper() if st else item.get("status", "")
    right = soup.select_one(".col-lg-4")
    rt = txt(right) if right else ""
    m = re.search(r"Lance inicial:\s*R\$\s*([\d.,]+)", rt)
    if m: d["lance_inicial"] = money(m.group(1))
    m = re.search(r"Maior lance atual:\s*R\$\s*([\d.,]+)", rt)
    if m: d["maior_lance"] = money(m.group(1))
    m1 = re.search(r"1º Leilão:\s*(\d{2}/\d{2}/\d{4})", rt)
    m2 = re.search(r"2º Leilão:\s*(\d{2}/\d{2}/\d{4})", rt)
    if m1: d["data1"] = iso_date(m1.group(1))
    if m2: d["data2"] = iso_date(m2.group(1))
    m = re.search(r"Leilão:\s*(\d{2}/\d{2}/\d{4})", rt)
    if m and not m1: d["data1"] = iso_date(m.group(1))
    d["judicial"] = bool(re.search(r"\bProcesso\b", rt)) or "LEILÃO JUDICIAL" in texto.upper() or "LEILAO JUDICIAL" in texto.upper()
    # avaliação
    m = (re.search(r"Valor Avaliado:\s*\$?\s*([\d.,]+)", texto) or
         re.search(r"Avalia[çc][ãa]o(?: do im[óo]vel)?[^\d]{0,40}R\$\s*([\d.,]+)", texto, re.I) or
         re.search(r"Avaliad[oa][^\d]{0,30}R\$\s*([\d.,]+)", texto, re.I))
    if m: d["avaliacao"] = money_any(m.group(1))
    # áreas / matrícula / cartório
    m = re.search(r"Área Privativa:\s*([\d.,]+)\s*m", texto) or re.search(r"[ÁA]rea [úu]til:\s*([\d.,]+)\s*m", texto, re.I) or re.search(r"[ÁA]rea construída:\s*([\d.,]+)\s*m", texto, re.I)
    if m: d["area_privativa_m2"] = num_br(m.group(1)) if "," in m.group(1) else money_any(m.group(1))
    m = re.search(r"Área Terreno:\s*([\d.,]+)\s*m", texto) or re.search(r"[ÁA]rea (?:do )?terreno:\s*([\d.,]+)\s*m", texto, re.I)
    if m: d["area_terreno_m2"] = num_br(m.group(1)) if "," in m.group(1) else money_any(m.group(1))
    m = re.search(r"Matr[íi]cula(?: do im[óo]vel)?(?: n[ºo°]?)?:?\s*([\d.]+(?:\s*,\s*[\d.]+)*)", texto, re.I)
    if m: d["matricula"] = m.group(1).strip()
    m = re.search(r"Cart[óo]rio de Registro:\s*(.+?)(?:\s{2,}|Inscri|$)", texto)
    if not m: m = re.search(r"do\s+(\d+[ºo°]?\s*(?:CRI|ORI|Ofici[ao]l?|Registro de Im[óo]veis)[^.;]{0,60})", texto, re.I)
    if m: d["cartorio"] = m.group(1).strip()[:120]
    m = re.search(r"[Vv]agas? de garagem:?\s*(\d+)|(\d+)\s*vaga\(?s?\)?", texto)
    if m: d["vagas"] = int(m.group(1) or m.group(2))
    m = re.search(r"(\d+)\s*(?:dorm|quarto)", texto, re.I)
    if m: d["quartos"] = int(m.group(1))
    m = re.search(r"\b(\d{5})-?(\d{3})\b", txt(h2) + " " + texto[:600])
    if m: d["cep"] = m.group(1) + "-" + m.group(2)
    m = re.search(r"(Condom[íi]nio e IPTU:.*?)(?:Contas de consumo|$)", texto, re.S) or re.search(r"(D[ée]bitos? de (?:IPTU|condom[íi]nio)[^.]*\.)", texto, re.I) or re.search(r"(OS D[ÉE]BITOS DE IPTU E CONDOM[ÍI]NIO[^.]*\.)", texto)
    if m: d["debitos_regra"] = m.group(1).strip()[:400]
    if "aceita visitação: não" in texto.lower(): pass
    d["aceita_financiamento"] = True if re.search(r"financiamento", texto, re.I) else None
    d["aceita_fgts"] = True if re.search(r"\bFGTS\b", texto) else None
    # fotos
    fotos = []
    for img in soup.select("#carousel-photos img, #container_photos img"):
        src = img.get("src") or img.get("data-src")
        if src and src not in fotos: fotos.append(src)
    d["fotos"] = fotos
    bid = soup.select_one("input#bid")
    d["leilao_id"] = bid.get("value") if bid else None
    return d


def lot_docs(lote_id, leilao_id):
    if not leilao_id: return {}
    h = get(BASE + "/Sale/LotDocs", {"loteId": lote_id, "leilaoId": leilao_id}, tries=2, timeout=20)
    if not h: return {}
    out = {}
    for a in BeautifulSoup(h, "html.parser").select("a[href]"):
        t = htmlmod.unescape(a.get("title") or txt(a)).lower()
        href = a["href"]
        if "edital" in t and "edital_url" not in out and "din" not in t: out["edital_url"] = href
        elif "matr" in t and "matricula_url" not in out: out["matricula_url"] = href
    return out


# ---------------------------------------------------------------- montagem
def build(item, d, docs):
    today = dt.date.today().isoformat()
    pracas = item.get("pracas") or []
    p1 = next((p for p in pracas if p["num"] == 1), None)
    p2 = next((p for p in pracas if p["num"] == 2), None)
    praca, data_leilao, lance = None, None, d.get("lance_inicial")
    if p1 and p2:
        if p1["data"] and p1["data"] < today and p2["valor"]:
            praca, data_leilao, lance = 2, p2["data"], p2["valor"]
        else:
            praca, data_leilao, lance = 1, p1["data"], p1["valor"] or lance
    elif p1:
        data_leilao = p1["data"]
        lance = lance or p1["valor"]
    data_leilao = data_leilao or d.get("data2") or d.get("data1")
    if lance is None and pracas: lance = pracas[0]["valor"]
    if lance is not None and lance < 1: lance = None
    avaliacao = d.get("avaliacao")
    if not avaliacao and p1 and p2 and p1["valor"] and p1["valor"] > 1: avaliacao = p1["valor"]
    if not avaliacao: avaliacao = lance

    status = d.get("status") or item.get("status", "")
    if d.get("judicial"): modalidade = "judicial"
    elif "PROPOSTA" in status: modalidade = "venda_direta"
    else: modalidade = "extrajudicial"

    titulo = d.get("titulo") or item.get("titulo") or ""
    descricao = d.get("descricao", "")
    fl = flags(descricao + " " + titulo)
    cidade = d.get("cidade")
    if not cidade:
        m = re.search(r",\s*([^,]+?)\s*[,/]?\s*SP\s*$", titulo)
        cidade = m.group(1) if m else ""
    bairro = d.get("bairro")
    if not bairro:
        m = re.search(r"\b(?:em|no|na)\s+(.+?),\s*" + re.escape(cidade or "@@"), titulo, re.I)
        if m: bairro = m.group(1).strip()
    fotos = d.get("fotos") or ([item["foto_capa"]] if item.get("foto_capa") else [])
    tp = tipo(item.get("tipo_raw") or titulo)
    if tp == "outro": tp = tipo(titulo)

    rec = {
        "id": "frazao:" + item["id_fonte"],
        "fonte": "frazao",
        "url": item["url"],
        "tipo": tp,
        "titulo": titulo,
        "endereco": d.get("endereco") or item.get("endereco") or None,
        "bairro": city(bairro) if bairro else None,
        "cidade": city(cidade),
        "uf": d.get("uf") or "SP",
        "cep": d.get("cep"),
        "area_privativa_m2": d.get("area_privativa_m2") or item.get("area_util"),
        "area_terreno_m2": d.get("area_terreno_m2"),
        "quartos": d.get("quartos"),
        "vagas": d.get("vagas"),
        "avaliacao": avaliacao,
        "lance_minimo": lance,
        "desagio_pct": desagio(avaliacao, lance),
        "modalidade": modalidade,
        "praca": praca,
        "data_leilao": data_leilao,
        "data_fim": data_leilao,
        "ocupado": d.get("ocupado"),
        "aceita_financiamento": d.get("aceita_financiamento"),
        "aceita_fgts": d.get("aceita_fgts"),
        "debitos_regra": d.get("debitos_regra"),
        "debitos_por_conta_comprador": None,
        "direitos_fiduciante": fl["direitos_fiduciante"],
        "fracao_ideal": fl["fracao_ideal"],
        "matricula": d.get("matricula"),
        "cartorio": d.get("cartorio"),
        "edital_url": docs.get("edital_url"),
        "matricula_url": docs.get("matricula_url"),
        "fotos": fotos,
        "descricao": descricao,
        "status_fonte": status,
        "vendedor": item.get("vendedor"),
        "coletado_em": now_iso(),
    }
    if rec.get("debitos_regra") and re.search(r"quitados? pelo vendedor", rec["debitos_regra"], re.I):
        rec["debitos_por_conta_comprador"] = False
    return rec


def collect():
    items = list_lots()
    print(f"[frazao] {len(items)} cards na listagem SP")
    out = []
    for i, it in enumerate(items, 1):
        if any(k in it.get("status", "") for k in SKIP_STATUS):
            continue
        d, docs = {}, {}
        try:
            h = get(it["url"])
            if h:
                d = parse_detail(h, it)
                if any(k in d.get("status", "") for k in SKIP_STATUS):
                    continue
                docs = lot_docs(it["id_fonte"], d.get("leilao_id"))
        except Exception as e:
            print(f"[frazao] erro no lote {it['id_fonte']}: {e}")
        try:
            rec = build(it, d, docs)
        except Exception as e:
            print(f"[frazao] erro montando lote {it['id_fonte']}: {e}")
            continue
        if rec["uf"] != "SP" or not rec["lance_minimo"]:
            continue
        out.append(rec)
        if i % 20 == 0: print(f"[frazao] {i}/{len(items)} lotes processados, {len(out)} válidos")
        time.sleep(0.3)
    return out


if __name__ == "__main__":
    save_raw("frazao", collect())
