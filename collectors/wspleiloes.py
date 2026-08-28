"""Coletor WSP Leilões (wspleiloes.com.br), judicial + extrajudicial, Brasil inteiro.

Método: HTML + bs4 (site próprio em PHP; sem API JSON).
  Listagem: https://wspleiloes.com.br/lotes/categoria/imoveis?page=N  (cards -> /item/<id>/detalhes)
  Detalhe:  https://wspleiloes.com.br/item/<id>/detalhes  (título, lance inicial, 1º/2º leilão com
            datas e valores, avaliação, comitente, cidade/UF, endereço, matrícula, descrição,
            documentos MATRÍCULA/EDITAL/LAUDO, fotos)

Bloqueios: nenhum WAF, mas o servidor só aceita TLS 1.3 e o Python 3.9 do sistema
(LibreSSL 2.8.3) falha com "tlsv1 alert protocol version"; nesse caso cai para `curl`
via subprocess com os mesmos headers.

Praça vigente: se hoje < data do 1º leilão -> praça 1 (lance do 1º); senão praça 2 (lance do 2º).
Só entram lotes "Aberto para lances" / "Aguarde Abertura"; encerrados/vendidos/suspensos são descartados.
"""
import re, sys, os, time, subprocess, datetime as dt
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bs4 import BeautifulSoup
from common import session, money, city, tipo, desagio, flags, now_iso, save_raw

FONTE = "wspleiloes"
BASE = "https://wspleiloes.com.br"
LIST = BASE + "/lotes/categoria/imoveis"
MAX = int(os.environ.get("GARIMPO_MAX", "0") or 0)
S = session()
USE_CURL = False


def _fetch(url):
    global USE_CURL
    if not USE_CURL:
        try:
            r = S.get(url, timeout=40)
            return r.status_code, r.text
        except Exception as e:
            if "SSL" not in str(e) and "TLS" not in str(e): raise
            print(f"[{FONTE}] SSL do Python falhou; usando curl", file=sys.stderr)
            USE_CURL = True
    hdr = sum([["-H", f"{k}: {v}"] for k, v in S.headers.items() if k in ("User-Agent", "Accept-Language")], [])
    cmd = ["curl", "-sL", "--max-time", "50", "-w", "\n%{http_code}"] + hdr + [url]
    out = subprocess.run(cmd, capture_output=True, text=True, timeout=70).stdout
    body, _, code = out.rpartition("\n")
    return int(code or 0), body


def _get(url, tries=3):
    for i in range(tries):
        try:
            code, text = _fetch(url)
            if code == 200 and text:
                return text
            print(f"[{FONTE}] HTTP {code} {url}", file=sys.stderr)
        except Exception as e:
            print(f"[{FONTE}] erro {e} {url}", file=sys.stderr)
        time.sleep(1.5 * (i + 1))
    return None


def _date(t):
    m = re.search(r"(\d{2})/(\d{2})/(\d{4})", t or "")
    return f"{m.group(3)}-{m.group(2)}-{m.group(1)}" if m else None


def _lines(sp):
    return [re.sub(r"\s+", " ", x).strip() for x in sp.get_text("\n", strip=True).split("\n") if x.strip()]


def _after(lines, label, n=1):
    """Valor que vem logo após a linha `label` (comparação sem acento/caixa)."""
    lab = label.lower()
    for i, l in enumerate(lines):
        if l.lower().startswith(lab):
            rest = l[len(label):].strip(" :")
            if rest: return rest
            return " ".join(lines[i + 1:i + 1 + n])
    return ""


def _list_ids():
    ids, page = [], 1
    while True:
        h = _get(f"{LIST}?page={page}")
        if not h: break
        found = re.findall(r"/item/(\d+)/detalhes", h)
        new = [x for x in dict.fromkeys(found) if x not in ids]
        print(f"[{FONTE}] listagem página {page}: {len(new)} novos", file=sys.stderr)
        if not new: break
        ids.extend(new)
        page += 1
        time.sleep(0.5)
    return ids


def _item(iid):
    url = f"{BASE}/item/{iid}/detalhes"
    h = _get(url)
    if not h: return None
    sp = BeautifulSoup(h, "html.parser")
    L = _lines(sp)
    full = "\n".join(L)
    status = ""
    for k in ("Aberto para lances", "Aguarde Abertura", "Em disputa", "Encerrado", "Vendido", "Suspenso", "Cancelado", "Retirado"):
        if re.search(re.escape(k), full, re.I): status = k.lower(); break
    if any(k in status for k in ("encerr", "vendid", "suspens", "cancel", "retirad")):
        return None
    t = sp.title.get_text(" ", strip=True) if sp.title else ""
    titulo = re.split(r"\s+-\s+Lote\s+\d+", t)[0].strip()
    if not titulo:
        m = re.search(r"LOTE\s+\d+\s*\n(?:Voltar a Lista\n)?(?:LOTE\s+\d+\n)?(.+?)\n", full)
        if m: titulo = m.group(1).strip()
    d1 = _date(_after(L, "Data 1º Leilão"))
    d2 = _date(_after(L, "Data 2º Leilão"))
    # "Lance Inicial:" aparece duas vezes (1º e 2º leilão), na ordem
    vals = [money(x) for x in re.findall(r"Lance Inicial:\s*\n?\s*(R\$\s*[\d\.\,]+)", full)]
    v1 = vals[0] if vals else None
    v2 = vals[1] if len(vals) > 1 else None
    aval = money(_after(L, "Valor de Avaliação"))
    ini = money(_after(L, "LANCE INICIAL"))
    today = dt.date.today().isoformat()
    if d2 and d1 and today > d1 and v2:
        praca, lance, data = 2, v2, d2
    elif d1:
        praca, lance, data = 1, v1 or ini, d1
    else:
        praca, lance, data = (1 if v1 else None), ini or v1, d1 or d2
    if not lance: lance = ini
    if not aval: aval = v1 or lance
    mod_txt = full.lower()
    if "leilão judicial" in mod_txt or "leilao judicial" in mod_txt: modalidade = "judicial"
    elif "extrajudicial" in mod_txt: modalidade = "extrajudicial"
    elif "venda direta" in mod_txt: modalidade = "venda_direta"
    else: modalidade = "outro"
    cid_uf = _after(L, "Cidade")
    m = re.match(r"(.+?)\s*[/\-]\s*([A-Z]{2})\s*$", cid_uf)
    cid, uf = (m.group(1), m.group(2)) if m else (cid_uf, None)
    if not uf:
        m = re.search(r"\b([A-ZÀ-Ú][A-Za-zÀ-ú' ]{2,40})\s*[/\-]\s*([A-Z]{2})\b", titulo + " " + full[:3000])
        if m: cid, uf = m.group(1), m.group(2)
    if not uf:
        raise ValueError("sem UF")
    endereco = _after(L, "Endereço")
    mm = re.search(r"\nMatr[ií]cula:\s*\n?([^\n]+)", full)
    matricula = mm.group(1).strip() if mm else ""
    desc = ""
    i = next((k for k, l in enumerate(L) if l.lower().startswith("descrição")), None)
    if i is not None:
        j = next((k for k in range(i + 1, len(L)) if L[k].lower().startswith(("compartilhar", "documentos", "últimos lances", "configurações"))), len(L))
        desc = "\n".join(L[i + 1:j])
    docs = {}
    for a in sp.select("a[href]"):
        t = a.get_text(" ", strip=True).upper()
        href = a["href"]
        if not href.startswith("http"): href = BASE + href if href.startswith("/") else href
        if t in ("MATRÍCULA", "MATRICULA", "EDITAL", "LAUDO") and t not in docs: docs[t] = href
    fotos = []
    for a in sp.select("a[href], img[src]"):
        src = a.get("href") or a.get("src") or ""
        if re.search(r"/bens/\d+/.*\.(jpe?g|png|webp)", src, re.I) and src not in fotos:
            fotos.append(src if src.startswith("http") else BASE + src)
    leiloeiro = _after(L, "LEILOEIRO OFICIAL")
    comitente = _after(L, "Comitente")
    vara = comitente if re.search(r"vara|ju[ií]zo|comarca", comitente, re.I) else None
    fl = flags(titulo + "\n" + desc)
    area = None
    m = re.search(r"(\d+(?:[.,]\d+)?)\s*m²", titulo)
    if m: area = money(m.group(1))
    tt = tipo(titulo)
    if tt == "outro": tt = tipo(desc[:300])
    if tt == "outro" and area: tt = "outro"
    low = desc.lower()
    ocupado = None
    if re.search(r"\bdesocupad", low): ocupado = False
    elif re.search(r"\bocupad", low): ocupado = True
    item = {
        "id": f"{FONTE}:{iid}",
        "fonte": FONTE,
        "url": url,
        "tipo": tt,
        "titulo": titulo,
        "endereco": endereco or None,
        "cidade": city(cid),
        "uf": uf,
        "area_privativa_m2": area if tt != "terreno" else None,
        "area_terreno_m2": area if tt == "terreno" else None,
        "avaliacao": aval,
        "lance_minimo": lance,
        "desagio_pct": desagio(aval, lance),
        "modalidade": modalidade,
        "praca": praca,
        "data_leilao": data,
        "data_fim": data,
        "lance_1a_praca": v1,
        "lance_2a_praca": v2,
        "leiloeiro": leiloeiro or None,
        "vara": vara,
        "matricula": matricula or None,
        "ocupado": ocupado,
        "direitos_fiduciante": fl["direitos_fiduciante"],
        "fracao_ideal": fl["fracao_ideal"],
        "edital_url": docs.get("EDITAL"),
        "matricula_url": docs.get("MATRÍCULA") or docs.get("MATRICULA"),
        "fotos": fotos,
        "descricao": desc[:6000],
        "coletado_em": now_iso(),
    }
    return {k: v for k, v in item.items() if v is not None or k in ("praca", "ocupado", "data_leilao")}


def collect():
    ids = _list_ids()
    if MAX: ids = ids[:MAX]
    print(f"[{FONTE}] {len(ids)} lotes na categoria imóveis; buscando detalhes...", file=sys.stderr)
    items, seen = [], set()
    for iid in ids:
        try:
            it = _item(iid)
            if it and it.get("lance_minimo") and it.get("avaliacao") and it["id"] not in seen:
                seen.add(it["id"]); items.append(it)
        except Exception as e:
            print(f"[{FONTE}] falha item {iid}: {e}", file=sys.stderr)
        time.sleep(0.4)
    return items


if __name__ == "__main__":
    save_raw(FONTE, collect())
