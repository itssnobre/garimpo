"""Coletor Fidalgo Leilões (fidalgoleiloes.com.br), judicial + extrajudicial (Caixa, TJSP...),
Brasil inteiro.

Método: HTML + bs4 (site PHP próprio, charset ISO-8859-1; sem API JSON).
  Home:     https://www.fidalgoleiloes.com.br/  -> links leilao.php?idLeilao=<id> (leilões ativos)
  Leilão:   leilao.php?idLeilao=<id>&lista=0&ordem=0&pagina=<p>&chk[]=1.1&chk[]=1.2&chk[]=1.3&openFilter=1
            30 lotes/página ("Exibindo resultado X a Y de N"). O filtro lateral traz
            "Imóveis (N)" com subcategorias (checkbox chk[] com valor "1.x"); leilões sem imóveis
            são pulados. Cards -> goTo('lote.php?idLote=<id>').
  Lote:     lote.php?idLote=<id>  (título/descrição, Avaliação, Valor de venda, Lance inicial,
            Local do bem "..., BAIRRO - CIDADE/UF", modalidade Judicial/Extrajudicial, comitente,
            status "Aberto para lances", data, edital, documentos, fotos)

Bloqueios: nenhum observado (Cloudflare passivo); 0.3s entre requests, 4 threads nos lotes.
Só entram lotes "Aberto para lances"/"Aguardando"; encerrados/vendidos/suspensos descartados.
"""
import re, sys, os, time
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bs4 import BeautifulSoup
from common import session, money, city, tipo, desagio, flags, now_iso, save_raw

FONTE = "fidalgoleiloes"
BASE = "https://www.fidalgoleiloes.com.br"
THREADS = 4
MAX = int(os.environ.get("GARIMPO_MAX", "0") or 0)
UFS = "AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO"
S = session()


def _get(url, tries=3):
    for i in range(tries):
        try:
            r = S.get(url, timeout=40)
            if r.status_code == 200:
                r.encoding = "ISO-8859-1"
                return r.text
            print(f"[{FONTE}] HTTP {r.status_code} {url}", file=sys.stderr)
        except Exception as e:
            print(f"[{FONTE}] erro {e} {url}", file=sys.stderr)
        time.sleep(1.5 * (i + 1))
    return None


def _date(t):
    m = re.search(r"(\d{2})/(\d{2})/(\d{4})", t or "")
    return f"{m.group(3)}-{m.group(2)}-{m.group(1)}" if m else None


def _lines(sp):
    return [re.sub(r"\s+", " ", x).strip() for x in sp.get_text("\n", strip=True).split("\n") if x.strip()]


def _after(lines, label):
    lab = label.lower()
    for i, l in enumerate(lines):
        if l.lower().startswith(lab):
            rest = l[len(label):].strip(" :")
            return rest or (lines[i + 1] if i + 1 < len(lines) else "")
    return ""


def _leiloes():
    h = _get(BASE + "/")
    if not h: return []
    ids = list(dict.fromkeys(re.findall(r"leilao\.php\?idLeilao=(\d+)", h)))
    return ids


def _lotes_do_leilao(lid):
    """Ids de lotes de imóveis do leilão (ou [] se o leilão não tem imóveis)."""
    h = _get(f"{BASE}/leilao.php?idLeilao={lid}")
    if not h: return []
    sp = BeautifulSoup(h, "html.parser")
    chks = []
    for span in sp.select("span.h6"):
        if re.match(r"\s*Im[óo]veis\s*\((\d+)\)", span.get_text()):
            card = span.find_parent("div", class_="card")
            if card:
                chks = [i["value"] for i in card.select('input[name="chk[]"]') if i.get("value")]
            break
    if not chks: return []
    q = "&".join(f"chk%5B%5D={v}" for v in chks)
    ids, page = [], 1
    while True:
        url = f"{BASE}/leilao.php?idLeilao={lid}&lista=0&ordem=0&pagina={page}&{q}&openFilter=1"
        h = _get(url)
        if not h: break
        found = list(dict.fromkeys(re.findall(r"lote\.php\?idLote=(\d+)", h)))
        m = re.search(r"Exibindo resultado (\d+) a (\d+) de (\d+)", h)
        total = int(m.group(3)) if m else 0
        new = [x for x in found if x not in ids]
        ids.extend(new)
        if not new or len(ids) >= total: break
        page += 1
        time.sleep(0.3)
    print(f"[{FONTE}] leilão {lid}: {len(ids)} lotes de imóveis", file=sys.stderr)
    return ids


def _lote(lid):
    url = f"{BASE}/lote.php?idLote={lid}"
    h = _get(url)
    time.sleep(0.3)
    if not h: return None
    sp = BeautifulSoup(h, "html.parser")
    L = _lines(sp)
    full = "\n".join(L)
    status = ""
    for k in ("Aberto para lances", "Aguardando", "Em disputa", "Em andamento", "Encerrado", "Vendido", "Suspenso", "Cancelado", "Retirado", "Condicional"):
        if re.search(re.escape(k), full, re.I): status = k.lower(); break
    if any(k in status for k in ("encerr", "vendid", "suspens", "cancel", "retirad")):
        return None
    i0 = next((i for i, l in enumerate(L) if re.match(r"^LOTE\s+\d+", l)), None)
    if i0 is None: return None
    lote_num = re.sub(r"\D", "", L[i0])
    # descrição = primeira linha "de conteúdo" após os botões
    desc = ""
    for l in L[i0 + 1:i0 + 12]:
        if len(l) > 40 and not re.match(r"(IMAGEM|EDITAL|DE LEIL|AUDIT|LISTA|DOS LOTES)", l):
            desc = l; break
    aval = money(_after(L, "Avaliação"))
    venda = money(_after(L, "Valor de venda"))
    inicial = money(_after(L, "Lance inicial"))
    atual = money(_after(L, "LANCE ATUAL"))
    local = _after(L, "Local do bem") or _after(L, "Local do(s) bem(ns)")
    m = re.search(r"(?:^|[-,])\s*([^-,/]+?)\s*/\s*(" + UFS + r")\b\.?\s*$", local.strip())
    if not m:
        m = re.search(r"([A-Za-zÀ-ú' ]{2,40})\s*/\s*(" + UFS + r")\b", local + " " + desc)
    if not m:
        raise ValueError(f"sem UF em '{local[:60]}'")
    cid, uf = m.group(1).strip(), m.group(2)
    parts = [p.strip() for p in re.split(r"\s+-\s+", local)]
    bairro = parts[-2] if len(parts) >= 3 else None
    endereco = " - ".join(parts[:-2]) if len(parts) >= 3 else (parts[0] if parts and "/" not in parts[0] else None)
    lance = None
    if atual and atual > 0: lance = atual
    if not lance: lance = venda or inicial
    if not lance: return None
    if not aval or aval < lance: aval = max(aval or 0, venda or 0, lance)
    tail = full.lower()
    if re.search(r"\nextrajudicial\n", tail): modalidade = "extrajudicial"
    elif re.search(r"\njudicial\n", tail): modalidade = "judicial"
    elif "venda direta" in tail: modalidade = "venda_direta"
    elif "licita" in tail: modalidade = "licitacao_aberta"
    else: modalidade = "outro"
    if "caixa econ" in tail and modalidade == "extrajudicial" and re.search(r"licita[çc][ãa]o aberta", tail):
        modalidade = "licitacao_aberta"
    praca = None
    mp = re.search(r"(\d)\s*[ªa]\s*pra[çc]a", tail)
    if mp: praca = int(mp.group(1))
    elif re.search(r"(\d)\s*[ºo°]\s*leil[ãa]o", tail):
        praca = int(re.search(r"(\d)\s*[ºo°]\s*leil[ãa]o", tail).group(1))
    data = _date(_after(L, "Data"))
    comit = ""
    j = next((i for i, l in enumerate(L) if l.lower() in ("extrajudicial", "judicial")), None)
    if j is not None and j + 1 < len(L): comit = L[j + 1]
    docs = {}
    for a in sp.select("a[href]"):
        t = a.get_text(" ", strip=True).lower()
        href = a["href"]
        if not href: continue
        if not href.startswith("http"): href = BASE + "/" + href.lstrip("./")
        if "edital" in t and "edital_url" not in docs: docs["edital_url"] = href
        if "matricula" in t or "matrícula" in t:
            if "matricula_url" not in docs: docs["matricula_url"] = href
    fotos = []
    for im in sp.select("img"):
        src = im.get("src") or im.get("data-src") or ""
        if re.search(r"(fotos|lotes|imagens|upload)/", src, re.I) and "logo" not in src.lower() and src not in fotos:
            fotos.append(src if src.startswith("http") else BASE + "/" + src.lstrip("./"))
    mm = re.search(r"Matr[ií]cula:?\s*([\d\.]+)", desc)
    q = re.search(r"(\d+)\s*(?:qts|quartos|dorm)", desc, re.I)
    ap = re.search(r"([\d\.,]+)\s*m2 de área privativa", desc, re.I)
    at = re.search(r"([\d\.,]+)\s*m2 de área do terreno", desc, re.I)
    atot = re.search(r"([\d\.,]+)\s*m2 de área total", desc, re.I)
    tt = tipo(desc.split(",")[0])
    if tt == "outro": tt = tipo(desc[:200])
    low = full.lower()
    ocupado = None
    if re.search(r"\bdesocupad", low): ocupado = False
    elif re.search(r"\bocupad", low): ocupado = True
    deb = None
    md = re.search(r"(D[ÉE]BITOS E TRIBUTOS:.*?)(?:\n[A-ZÁÉÍÓÚ ]{6,}:|\nLocal do)", full, re.S)
    if md: deb = re.sub(r"\s+", " ", md.group(1))[:600]
    fl = flags(desc + "\n" + full[:4000])
    item = {
        "id": f"{FONTE}:{lid}",
        "fonte": FONTE,
        "url": url,
        "tipo": tt,
        "titulo": desc[:200] or f"Lote {lote_num}",
        "endereco": endereco,
        "bairro": bairro,
        "cidade": city(cid),
        "uf": uf,
        "area_privativa_m2": money(ap.group(1)) if ap else (money(atot.group(1)) if atot and tt != "terreno" else None),
        "area_terreno_m2": money(at.group(1)) if at else (money(atot.group(1)) if atot and tt == "terreno" else None),
        "quartos": int(q.group(1)) if q else None,
        "avaliacao": aval,
        "lance_minimo": lance,
        "desagio_pct": desagio(aval, lance),
        "modalidade": modalidade,
        "praca": praca,
        "data_leilao": data,
        "data_fim": data,
        "leiloeiro": "Fidalgo Leilões",
        "vara": comit if modalidade == "judicial" and comit else None,
        "matricula": mm.group(1) if mm else None,
        "ocupado": ocupado,
        "debitos_regra": deb,
        "debitos_por_conta_comprador": (True if deb and re.search(r"responsabilidade do comprador|arrematante", deb, re.I) else None),
        "aceita_financiamento": True if re.search(r"financ|parcelamento|parcelad", low) else None,
        "aceita_fgts": True if "fgts" in low else None,
        "direitos_fiduciante": fl["direitos_fiduciante"],
        "fracao_ideal": fl["fracao_ideal"],
        "edital_url": docs.get("edital_url"),
        "matricula_url": docs.get("matricula_url"),
        "fotos": fotos,
        "descricao": desc[:6000],
        "coletado_em": now_iso(),
    }
    return {k: v for k, v in item.items() if v is not None or k in ("praca", "ocupado", "data_leilao")}


def collect():
    leiloes = _leiloes()
    print(f"[{FONTE}] {len(leiloes)} leilões na home", file=sys.stderr)
    lotes = []
    for lid in leiloes:
        try:
            lotes.extend(_lotes_do_leilao(lid))
        except Exception as e:
            print(f"[{FONTE}] falha leilão {lid}: {e}", file=sys.stderr)
        time.sleep(0.3)
        if MAX and len(lotes) >= MAX: break
    lotes = list(dict.fromkeys(lotes))
    if MAX: lotes = lotes[:MAX]
    print(f"[{FONTE}] {len(lotes)} lotes de imóveis; buscando detalhes...", file=sys.stderr)
    items, seen = [], set()

    def work(lid):
        try:
            return _lote(lid)
        except Exception as e:
            print(f"[{FONTE}] falha lote {lid}: {e}", file=sys.stderr)
            return None
    with ThreadPoolExecutor(THREADS) as ex:
        for i, it in enumerate(ex.map(work, lotes), 1):
            if it and it["id"] not in seen:
                seen.add(it["id"]); items.append(it)
            if i % 50 == 0: print(f"[{FONTE}] detalhes {i}/{len(lotes)}", file=sys.stderr)
    return items


if __name__ == "__main__":
    save_raw(FONTE, collect())
