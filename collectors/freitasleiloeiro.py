"""Coletor Freitas Leiloeiro (www.freitasleiloeiro.com.br), Brasil inteiro, judicial + extrajudicial.

Método: HTML + bs4 (ASP.NET MVC; a listagem é uma partial view carregada por ajax).
  Listagem: GET /Leiloes/PesquisarLotes?Categoria=2&TipoLoteId=0&FaixaValor=0&Condicao=0&PatioId=0
                &Estado=&Cidade=&ClienteSclId=0&PageNumber=N&TopRows=100  (header X-Requested-With)
            Categoria 2 = imóveis (1 = veículos, 3 = materiais). Devolve HTML com div.cardlote;
            termina quando vem "Nenhum lote localizado"/sem cards. Sem token anti-forgery.
            Auxiliares JSON (só p/ conferência): /Leiloes/PesquisarLotesTipos?categoria=2 e
            /Leiloes/PesquisarLotesUfs?&subTipoId=0 (contagem por UF).
  Detalhe:  /Leiloes/LoteDetalhes?leilaoId=X&loteNumero=N (título do leilão, tipo | cidade/UF, praças,
            endereço, descrição, lance inicial/mínimo, leiloeiro, condições, PDFs de edital/matrícula).
            + /Leiloes/RetornarMaiorLanceLote?leilaoId=X&loteNumero=N&modeloRecebePropostas=False
              (hidden #hdMaiorLance = maior lance atual; 0 se não há lances)
            + /Leiloes/ListarFotosLote?leilaoId=X&loteNumero=N (galeria de fotos).

Limitações:
- O site não expõe "avaliação" como campo. Judicial: extraída da descrição ("avaliado em R$", "avaliação ... R$");
  extrajudicial (alienação fiduciária): o lance mínimo do 1º leilão é usado como avaliação;
  leilões de bancos (imóveis próprios, "LEILÃO ON-LINE - N IMÓVEIS - BANCO X"): avaliação = lance inicial (deságio 0).
- O WAF devolve 403 após ~300 requests rápidos: por isso 2 threads, ~0.6s entre requests e backoff de 20s+ no 403.
- Status vem do card (ABERTO PARA LANCES / ABERTO PARA PROPOSTAS / EM LOTEAMENTO = em breve); encerrados/vendidos ficam fora.
"""
import re, sys, os, time, html as htmlmod
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bs4 import BeautifulSoup
from common import session, money, city, tipo, desagio, flags, now_iso, save_raw

FONTE = "freitasleiloeiro"
BASE = "https://www.freitasleiloeiro.com.br"
LIST = BASE + "/Leiloes/PesquisarLotes"
THREADS = 2
MAX = int(os.environ.get("GARIMPO_MAX", "0") or 0)
UFS = {"AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"}

def _get(s, url, params=None, tries=3):
    for i in range(tries):
        try:
            r = s.get(url, params=params, timeout=40, headers={"X-Requested-With": "XMLHttpRequest"})
            if r.status_code == 200:
                return r.text
            print(f"[{FONTE}] HTTP {r.status_code} {url}", file=sys.stderr)
            if r.status_code == 403: time.sleep(20 * (i + 1)); continue   # WAF: bloqueio temporário por volume
        except Exception as e:
            print(f"[{FONTE}] erro {e} {url}", file=sys.stderr)
        time.sleep(1.5 * (i + 1))
    return None

def _date(t):
    m = re.search(r"(\d{2})/(\d{2})/(\d{4})", t or "")
    return f"{m.group(3)}-{m.group(2)}-{m.group(1)}" if m else None

def _txt(e):
    return re.sub(r"\s+", " ", e.get_text(" ", strip=True)) if e else ""

def _parse_card(c):
    a = c.select_one("a[href*='LoteDetalhes']")
    if not a: return None
    m = re.search(r"leilaoId=(\d+)&(?:amp;)?loteNumero=(\d+)", a["href"])
    if not m: return None
    lid, num = m.group(1), m.group(2)
    return {
        "leilao_id": lid, "lote": num,
        "url": f"{BASE}/Leiloes/LoteDetalhes?leilaoId={lid}&loteNumero={num}",
        "status": _txt(c.select_one(".cardLote-btn")).lower(),
        "resumo": _txt(c.select_one(".cardLote-descBens")),
        "lance_card": money(_txt(c.select_one(".cardLote-vlr"))),
        "label_card": _txt(c.select_one(".cardLote-lance")).lower(),
        "data_card": _date(_txt(c.select_one(".cardLote-data"))),
        "local_card": _txt(c.select_one(".cardLote-details")),
    }

def _list_pages(s):
    cards, page = [], 1
    while True:
        h = _get(s, LIST, {"Nome": "", "Categoria": 2, "TipoLoteId": 0, "FaixaValor": 0, "Condicao": 0, "PatioId": 0,
                           "Tag": "", "Estado": "", "Cidade": "", "ClienteSclId": 0, "PageNumber": page, "TopRows": 100})
        if not h or "Nenhum lote localizado" in h or "Erro ao tentar" in h: break
        sp = BeautifulSoup(h, "html.parser")
        found = [x for x in (_parse_card(c) for c in sp.select("div.cardlote")) if x]
        print(f"[{FONTE}] listagem página {page}: {len(found)} cards", file=sys.stderr)
        cards.extend(found)
        if not found or page > 50: break
        page += 1
        time.sleep(0.5)
    seen, out = set(), []
    for c in cards:
        if c["url"] in seen: continue
        seen.add(c["url"]); out.append(c)
    return out

def _detail(s, card):
    h = _get(s, card["url"])
    time.sleep(0.6)
    d = {}
    if not h: return d
    sp = BeautifulSoup(h, "html.parser")
    d["leilao_titulo"] = _txt(sp.select_one("h4.mt-4"))
    hdr = _txt(sp.select_one("div.text-secondary.fs-5"))            # "Casa | Cidade/UF"
    if "|" in hdr:
        d["tipo_txt"], d["local_txt"] = [x.strip() for x in hdr.split("|", 1)]
    dl = sp.find("small", string=re.compile(r"Data do Leil"))
    if dl: d["data_leilao"] = _date(_txt(dl.find_parent("div")))
    pr = sp.select_one("div.text-secondary.pt-2.small.fw-bold")
    d["pracas_txt"] = pr.get_text("\n", strip=True) if pr else ""
    lab = sp.find("div", string=re.compile(r"^\s*Endere"))
    if lab: d["endereco"] = _txt(lab.find_next_sibling("div"))
    lab = sp.find("div", string=re.compile(r"Descri\S+ completa"))
    if lab:
        box = lab.find_next_sibling("div")
        d["descricao"] = re.sub(r"\n\s*\n+", "\n", box.get_text("\n", strip=True)) if box else ""
    for th in sp.select("table th"):
        k, v = _txt(th).lower(), _txt(th.find_next_sibling("td"))
        if "leiloeiro" in k: d["leiloeiro"] = v
        elif "abertura" in k: d["abertura"] = v
        elif "modalidade" in k: d["modalidade_txt"] = v
    for a in sp.select("a[href$='.pdf']"):
        href = a["href"].lower()
        if "/edital/" in href and "edital_url" not in d: d["edital_url"] = a["href"]
        if "/matricula/" in href and "matricula_url" not in d: d["matricula_url"] = a["href"]
    # caixa de lance: valor + rótulo (Lance Inicial / Lance Mínimo / Incremento Mínimo)
    for v in sp.select("div.fw-bold.text-warning"):
        lab = _txt(v.find_next_sibling("small")).lower()
        if "lance" in lab: d["lance"] = money(_txt(v))
        elif "incremento" in lab: d["incremento"] = money(_txt(v))
    # condições de venda (texto solto no card lateral)
    cond = sp.find(string=re.compile(r"Leia atentamente as condi"))
    if cond:
        par = cond.find_parent("div")
        par = par.find_parent("div") if par else None
        d["condicoes"] = _txt(par)[:3000] if par else ""
    # maior lance atual
    ml = _get(s, f"{BASE}/Leiloes/RetornarMaiorLanceLote",
              {"leilaoId": card["leilao_id"], "loteNumero": card["lote"], "modeloRecebePropostas": "False"}, tries=2)
    m = re.search(r'id="hdMaiorLance"\s+value="([^"]*)"', ml or "")
    d["maior_lance"] = money(m.group(1).replace(".", ",")) if m and m.group(1) not in ("", "0") else None
    # fotos
    fh = _get(s, f"{BASE}/Leiloes/ListarFotosLote", {"leilaoId": card["leilao_id"], "loteNumero": card["lote"]}, tries=2)
    fotos, seen = [], set()
    for src in re.findall(r'src="([^"]+/FOTOS/[^"]+)"', fh or "", re.I):
        if src not in seen: seen.add(src); fotos.append(src)
    d["fotos"] = fotos
    time.sleep(0.6)
    return d

def _pracas(txt):
    """'1º Leilão: dd/mm/aaaa ... R$ X' / '2º Leilão: ...' -> {1: (data, valor), 2: (data, valor)}"""
    out = {}
    for line in (txt or "").split("\n"):
        m = re.match(r"\s*(\d)[ºo°]\s*Leil", line, re.I)
        if not m: continue
        val = re.search(r"R\$\s*([\d\.\s]+,\d{2})", line)
        out[int(m.group(1))] = (_date(line), money(val.group(1)) if val else None)
    return out

def _avaliacao(desc):
    for pat in (r"Total Geral da Avalia\S+\s*R\$\s*([\d\.]+,\d{2})",
                r"avaliad[oa]s?\s+(?:em|por)\s+R\$\s*([\d\.]+,\d{2})",
                r"valor (?:total )?d[ae] avalia\S+[^R\n]{0,120}R\$\s*([\d\.]+,\d{2})",
                r"avalia\S+\s*(?:\([^)]*\))?\s*(?:d[oa] im\S+vel)?\s*:?\s*R\$\s*([\d\.]+,\d{2})"):
        ms = re.findall(pat, desc or "", re.I)
        if ms: return money(ms[-1])
    return None

def _build(card, d):
    desc = d.get("descricao") or card["resumo"]
    loc = d.get("local_txt") or card["local_card"]
    m = re.search(r"(.+?)\s*/\s*([A-Z]{2})\s*$", loc.strip())
    cid, uf = (m.group(1), m.group(2)) if m else (None, None)
    if uf not in UFS:
        m = re.search(r"([A-Za-zÀ-ú\s\.']+?)\s*/\s*([A-Z]{2})\b", desc[:200])
        if m and m.group(2) in UFS: cid, uf = m.group(1).strip(), m.group(2)
    if not uf: return None
    end = d.get("endereco") or ""
    endereco, bairro = None, None
    if end:
        e2 = re.sub(r"\s*-\s*[^-/]+/[A-Z]{2}\s*$", "", end)      # tira " - Cidade/UF"
        parts = [p.strip() for p in e2.split(",")]
        if len(parts) >= 2: endereco, bairro = ", ".join(parts[:-1]), parts[-1]
        else: endereco = e2
    tit = d.get("leilao_titulo") or ""
    tl = tit.lower(); dl = desc.lower(); st = card["status"]
    if "extrajudicial" in tl or "fiduci" in tl: modalidade = "extrajudicial"
    elif re.search(r"judicial|processo|execu|falência|falencia|fazenda p|vara\b", tl): modalidade = "judicial"
    elif "proposta" in st: modalidade = "venda_direta"
    else: modalidade = "venda_online"          # leilão de imóveis próprios de banco (Bradesco, Daycoval, Porto Bank...)
    pr = _pracas(d.get("pracas_txt"))
    data = d.get("data_leilao") or card["data_card"]
    praca = None
    if pr:
        if 2 in pr and pr[2][0] and data == pr[2][0]: praca = 2
        elif 1 in pr: praca = 1
    if "segundo leil" in tl: praca = 2
    elif "primeiro leil" in tl and praca is None: praca = 1
    lance_base = d.get("lance") or card["lance_card"]
    lance = d.get("maior_lance") or lance_base
    aval = _avaliacao(desc)
    if not aval and modalidade == "extrajudicial" and pr.get(1, (None, None))[1]: aval = pr[1][1]
    if not aval or aval < (lance_base or 0) * 0.5: aval = max(aval or 0, lance_base or 0)
    if not lance or not aval: return None
    ocupado = None
    if re.search(r"\bdesocupad", dl): ocupado = False
    elif re.search(r"\bocupad", dl): ocupado = True
    ap = re.search(r"[áa]rea\s+(?:útil|util|privativa|construída|construida)[^\d\n]{0,40}?([\d\.]+,\d+)\s*m", desc, re.I)
    at = re.search(r"[áa]rea\s+(?:total\s+)?(?:de\s+|do\s+)?terreno[^\d\n]{0,40}?([\d\.]+,\d+)\s*m", desc, re.I)
    mat = re.search(r"matr[ií]cula\(?s?\)?\s*(?:n[º°o.]*\s*)?([\d\.]+)", desc, re.I)
    cart = re.search(r"(\d{1,2}[º°oa]?\s*(?:CRI|Cart[óo]rio|Of[ií]cio|Registro de Im[óo]veis)[^\.\n;,]{0,60}?)(?:\s+sob\b|$|[\.\n;,])", desc, re.I)
    proc = re.search(r"(?:processo|proc\.?)\s*n[º°o.]*\s*([\d\.\-]{15,30})", tit + (" " + desc if modalidade == "judicial" else ""), re.I)
    vara = re.search(r"(\d{1,2}[ªa°º]?\s*Vara[^\.\n;,–]{0,60})", desc, re.I) if modalidade == "judicial" else None
    cond = (d.get("condicoes") or "").lower()
    fl = flags(tit + "\n" + desc)
    tt = tipo(d.get("tipo_txt") or "")
    if tt == "outro": tt = tipo(desc[:150])
    item = {
        "id": f"{FONTE}:{card['leilao_id']}-{int(card['lote'])}",
        "fonte": FONTE,
        "url": card["url"],
        "tipo": tt,
        "titulo": (card["resumo"] or tit)[:200],
        "endereco": endereco,
        "bairro": bairro,
        "cidade": city(cid or ""),
        "uf": uf,
        "area_privativa_m2": money(ap.group(1)) if ap else None,
        "area_terreno_m2": money(at.group(1)) if at else None,
        "avaliacao": aval,
        "lance_minimo": lance,
        "desagio_pct": desagio(aval, lance),
        "modalidade": modalidade,
        "praca": praca,
        "data_leilao": data,
        "data_fim": (pr.get(2) or (None,))[0] or data,
        "lance_1a_praca": (pr.get(1) or (None, None))[1],
        "lance_2a_praca": (pr.get(2) or (None, None))[1],
        "leiloeiro": d.get("leiloeiro"),
        "processo": proc.group(1) if proc else None,
        "vara": vara.group(1).strip() if vara else None,
        "matricula": mat.group(1) if mat else None,
        "cartorio": cart.group(1).strip() if cart else None,
        "ocupado": ocupado,
        "aceita_financiamento": True if re.search(r"financiamento (imobili|bancár)", cond) and "não há opção de financiamento" not in cond else (False if "não há opção de financiamento" in cond else None),
        "aceita_fgts": False if "sem uso do fgts" in cond else (True if "fgts" in cond else None),
        "direitos_fiduciante": fl["direitos_fiduciante"],
        "fracao_ideal": fl["fracao_ideal"],
        "edital_url": d.get("edital_url"),
        "matricula_url": d.get("matricula_url"),
        "fotos": d.get("fotos") or [],
        "descricao": desc[:6000],
        "status_fonte": card["status"],
        "coletado_em": now_iso(),
    }
    return {k: v for k, v in item.items() if v is not None or k in ("praca", "ocupado", "data_leilao")}

def collect():
    s = session()
    cards = _list_pages(s)
    skip = ("encerrad", "vendido", "suspens", "cancelad", "retirad", "arrematad", "finaliz")
    cards = [c for c in cards if not any(k in c["status"] for k in skip)]
    if MAX: cards = cards[:MAX]
    print(f"[{FONTE}] {len(cards)} lotes ativos (Brasil); buscando detalhes...", file=sys.stderr)
    items, seen = [], set()
    def work(c):
        try:
            return _build(c, _detail(s, c))
        except Exception as e:
            print(f"[{FONTE}] falha {c['url']}: {e}", file=sys.stderr)
            return None
    with ThreadPoolExecutor(THREADS) as ex:
        for i, it in enumerate(ex.map(work, cards), 1):
            if it and it.get("lance_minimo") and it["id"] not in seen:
                seen.add(it["id"]); items.append(it)
            if i % 25 == 0: print(f"[{FONTE}] detalhes {i}/{len(cards)}", file=sys.stderr)
    return items

if __name__ == "__main__":
    save_raw(FONTE, collect())
