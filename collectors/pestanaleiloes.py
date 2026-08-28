"""Coletor Pestana Leilões (www.pestanaleiloes.com.br), extrajudicial (Lei 9.514: Caixa, Bradesco,
Santander, Itaú, Sicredi...) + judicial/venda direta, Brasil inteiro.

Método: API JSON interna do portal (SPA React; HTML não traz nada).
  Leilões: GET  /api/v2/leilao                       -> lista de leilões ativos (id, nome, data, lotes[],
                                                        informacoesLei9514.dataLeilao1/2, documentos/edital).
  Busca:   POST /search-api/lote/filtrar {"tipoBem":462}  -> {"lotes":[ids...]} (462 = Imóveis).
  Lotes:   POST /api/v2/lote/por-ids {"ids":[...]}   -> detalhes (lanceMinimo, informacoesLei9514.valorLeilao1/2,
                                                        bens[].caracteristicas, imagens, documentos). Lotes de 50.
  Página:  https://www.pestanaleiloes.com.br/leilao/<idLeilao>/lote/<idLote>/
  Fotos:   https://ged.pestanaleiloes.com.br/ged/<arquivo>

Limitações:
- A busca devolve também lotes vendidos/antigos: mantemos só status "Disponível" (situacaoId 1)
  cujo leilão está na lista ativa.
- Avaliação: nos leilões Lei 9.514, valorLeilao1 é o valor de 1º leilão (= avaliação); em alguns lotes
  o valorLeilao2 (dívida) é MAIOR que o 1º — nesse caso deságio fica 0.
- Localização vem de caracteristicas com ícone MdOutlineLocationOn na ordem UF, cidade, bairro,
  logradouro, número, complemento; fallback: descrição do bem "Cidade UF ...".
"""
import re, sys, os, time, datetime as dt
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import session, money, city, tipo, desagio, flags, now_iso, save_raw

FONTE = "pestanaleiloes"
BASE = "https://www.pestanaleiloes.com.br"
CDN = "https://ged.pestanaleiloes.com.br/ged/"
BATCH = 50
MAX = int(os.environ.get("GARIMPO_MAX", "0") or 0)
UFS = {"AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"}

def _req(s, method, url, tries=3, **kw):
    for i in range(tries):
        try:
            r = s.request(method, url, timeout=60, **kw)
            if r.status_code == 200:
                return r.json()
            print(f"[{FONTE}] HTTP {r.status_code} {url}", file=sys.stderr)
        except Exception as e:
            print(f"[{FONTE}] erro {e} {url}", file=sys.stderr)
        time.sleep(2 * (i + 1))
    return None

def _iso(x):
    return x[:10] if x and re.match(r"\d{4}-\d{2}-\d{2}", x) else None

def _carac(bem):
    out = {"loc": [], "desc": ""}
    for c in bem.get("caracteristicas") or []:
        v = c.get("valor")
        if v is None: continue
        v = str(v).strip()
        if c.get("idTipoAtributo") == 1 and not out["desc"]: out["desc"] = v
        ic = c.get("icone") or ""
        if ic == "MdOutlineLocationOn": out["loc"].append(v)
        elif ic and ic not in out: out[ic] = v
    return out

def _num(v):
    if not v or "informado" in v.lower(): return None
    return money(v)

def _build(lot, lei):
    bem = (lot.get("bens") or [{}])[0]
    if (bem.get("tipoBem") or {}).get("id") != 462: return None
    c = _carac(bem)
    loc = [x for x in c["loc"]]
    uf = cid = bairro = None
    if loc and loc[0].upper() in UFS:
        uf = loc[0].upper()
        cid = loc[1] if len(loc) > 1 and "informado" not in loc[1].lower() else None
        bairro = loc[2] if len(loc) > 2 and "informado" not in loc[2].lower() else None
        endereco = ", ".join(x for x in loc[3:5] if x and "informado" not in x.lower()) or None
        compl = loc[5] if len(loc) > 5 and "informado" not in loc[5].lower() else None
    else:
        endereco = compl = None
    bdesc = bem.get("descricao") or ""
    ldesc = lot.get("descricao") or ""
    if not uf:
        m = re.search(r"\b-\s*([A-Z]{2})\s*$", ldesc) or re.match(r"^(.+?)\s+([A-Z]{2})\b", bdesc)
        if m:
            cand = m.group(m.lastindex).upper()
            if cand in UFS:
                uf = cand
                if not cid:
                    mm = re.match(r"^(.+?)\s+-\s+(.+?)\s+-\s+[A-Z]{2}\s*$", ldesc) or re.match(r"^(.+?)\s+[A-Z]{2}\b", bdesc)
                    if mm: cid = mm.group(mm.lastindex)
    if not uf: return None
    info = lot.get("informacoesLei9514") or {}
    l1, l2 = money(info.get("valorLeilao1")), money(info.get("valorLeilao2"))
    lance = money(lot.get("lanceMinimo")) or money(lot.get("valorInicial")) or money(lot.get("lanceInicial"))
    aval = None
    for b in (lot.get("valoresAdicionais") or {}).get("bens") or []:
        if b.get("avaliacaoLeiloeiro"): aval = money(b["avaliacaoLeiloeiro"])
    if not aval: aval = l1 if info.get("pertenceLei") and l1 else lance
    if not lance or not aval: return None
    li = lei.get("informacoesLei9514") or {}
    d1, d2 = _iso(li.get("dataLeilao1")), _iso(li.get("dataLeilao2"))
    today = dt.date.today().isoformat()
    praca = None
    if info.get("pertenceLei") and d1 and d2:
        praca = 2 if today > d1 else 1
    data = (d2 if praca == 2 else d1) or _iso(lei.get("data"))
    nome = lei.get("nome") or ""
    nl = nome.lower()
    if "venda direta" in nl: modalidade = "venda_direta"
    elif "judicial" in nl: modalidade = "judicial"
    elif "9.514" in nl or "9514" in nl or info.get("pertenceLei"): modalidade = "extrajudicial"
    else: modalidade = "extrajudicial"
    sub = (bem.get("subTipoBem") or {}).get("nome") or ""
    tt = tipo(c.get("MdOutlineHomeWork") or "")
    if tt == "outro": tt = tipo(sub)
    if tt == "outro": tt = tipo(ldesc + " " + bdesc)
    if tt == "outro" and "residencial" in sub.lower(): tt = "casa"
    desc = c["desc"] or bdesc
    ocupado = None
    oc = (c.get("MdOutlineHouse") or "").lower()
    if "desocupad" in oc: ocupado = False
    elif "ocupad" in oc: ocupado = True
    fotos = [CDN + (im.get("media") or im.get("original")) for im in bem.get("imagens") or [] if im.get("media") or im.get("original")]
    edital = next((d.get("link") for d in lei.get("documentos") or [] if "edital" in (d.get("nome") or "").lower()), None)
    matricula_url = next((d.get("link") for d in bem.get("documentos") or [] if "matr" in (d.get("nome") or "").lower()), None)
    mat = c.get("MdOutlineDescription")
    if mat and "informado" in mat.lower(): mat = None
    if not mat:
        m = re.search(r"matr[ií]cula:?\s*n?[º°.]?\s*([\d\.]{3,})", desc + " " + bdesc, re.I)
        mat = m.group(1) if m else None
    a_tot, a_priv, a_terr = _num(c.get("MdBorderAll")), _num(c.get("MdBorderClear")), _num(c.get("MdBorderOuter"))
    fl = flags(ldesc + "\n" + desc)
    fin = c.get("MdOutlineHail") or ""
    item = {
        "id": f"{FONTE}:{lot['id']}",
        "fonte": FONTE,
        "url": f"{BASE}/leilao/{lot['leilao']}/lote/{lot['id']}/",
        "tipo": tt,
        "titulo": ldesc or bdesc[:120],
        "endereco": ", ".join(x for x in (endereco, compl) if x) or None,
        "bairro": city(bairro) if bairro else None,
        "cidade": city(cid or ""),
        "uf": uf,
        "area_privativa_m2": (a_priv or a_tot) if tt in ("apartamento", "comercial", "casa") else None,
        "area_terreno_m2": a_terr or ((a_tot or a_priv) if tt in ("terreno", "rural") else None),
        "avaliacao": aval,
        "lance_minimo": lance,
        "desagio_pct": desagio(aval, lance),
        "modalidade": modalidade,
        "praca": praca,
        "data_leilao": data,
        "data_fim": data,
        "lance_1a_praca": l1,
        "lance_2a_praca": l2,
        "leiloeiro": lei.get("leiloeiro") or "Pestana Leilões",
        "comitente": nome or None,
        "matricula": mat,
        "ocupado": ocupado,
        "fotos": fotos,
        "edital_url": edital,
        "matricula_url": matricula_url,
        "aceita_financiamento": True if fin.lower().startswith("sim") else (False if fin.lower().startswith("n") and fin else None),
        "direitos_fiduciante": fl["direitos_fiduciante"],
        "fracao_ideal": fl["fracao_ideal"],
        "descricao": desc[:6000],
        "coletado_em": now_iso(),
    }
    return {k: v for k, v in item.items() if v is not None or k in ("praca", "ocupado", "data_leilao")}

def collect():
    s = session()
    s.headers.update({"Accept": "application/json", "Content-Type": "application/json", "Origin": BASE, "Referer": BASE + "/leilao-de-imoveis"})
    leiloes = {l["id"]: l for l in (_req(s, "GET", BASE + "/api/v2/leilao") or []) if l.get("id")}
    print(f"[{FONTE}] {len(leiloes)} leilões ativos", file=sys.stderr)
    r = _req(s, "POST", BASE + "/search-api/lote/filtrar", json={"tipoBem": 462}) or {}
    ids = [i for i in (r.get("lotes") or []) if isinstance(i, int)]
    # completa com os lotes listados nos leilões de imóveis (a busca pode omitir)
    for l in leiloes.values():
        if any((st.get("tipoBem") == 462) for st in l.get("subTipoBens") or []):
            ids.extend(l.get("lotes") or [])
    ids = list(dict.fromkeys(ids))
    if MAX: ids = ids[:MAX]
    print(f"[{FONTE}] {len(ids)} ids de lotes de imóveis; buscando detalhes em lotes de {BATCH}...", file=sys.stderr)
    items, seen = [], set()
    for i in range(0, len(ids), BATCH):
        chunk = ids[i:i + BATCH]
        lots = _req(s, "POST", BASE + "/api/v2/lote/por-ids", json={"ids": chunk}) or []
        for lot in lots:
            try:
                if lot.get("situacaoId") not in (1,) and (lot.get("status") or "").lower() not in ("disponível", "disponivel", "em pregão", "em pregao"):
                    continue
                lei = leiloes.get(lot.get("leilao"))
                if not lei: continue
                it = _build(lot, lei)
                if it and it["id"] not in seen:
                    seen.add(it["id"]); items.append(it)
            except Exception as e:
                print(f"[{FONTE}] falha lote {lot.get('id')}: {e}", file=sys.stderr)
        print(f"[{FONTE}] {min(i + BATCH, len(ids))}/{len(ids)} -> {len(items)} itens", file=sys.stderr)
        time.sleep(0.6)
    return items

if __name__ == "__main__":
    save_raw(FONTE, collect())
