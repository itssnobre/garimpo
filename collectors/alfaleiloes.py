"""Coletor Alfa Leilões (alfaleiloes.com), judicial + extrajudicial, Brasil inteiro.

Método: API REST pública (Django REST Framework, sem auth para leitura):
  Lotes:   GET https://alfaleiloes.com/api/lotes/?status=Aberto&limit=100&offset=N
           (status válidos: Aberto, Futuro, "Em breve", Suspenso, Encerrado...; paginação count/next).
  Leilão:  GET https://alfaleiloes.com/api/leiloes/<item>/  (UF, tipo_leilao, datas das praças,
           estágio atual "1P"/"2P", edital). 1 request por leilão (cache, ~120 leilões p/ ~700 lotes).
  Página:  https://alfaleiloes.com/lote/<id>/  (redireciona para a URL com slug).

Limitações:
- A API mistura veículos, máquinas e lotes de teste ("Lote Teste", "teste painel") com status Aberto;
  filtramos por título/subtítulo (palavras de imóvel x veículo) e descartamos "teste".
- categoria/estado/cidade vêm como ids numéricos sem endpoint público de lookup (/api/categorias/
  exige auth); UF sai do título "(SP)" ou do leilão; cidade sai do nome do leilão "Cidade (UF) – ...".
- Fotos: URLs S3 assinadas (expiram em 7 dias); não coletadas.
"""
import re, sys, os, time, html as htmlmod
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import session, money, city, tipo, desagio, flags, now_iso, save_raw

FONTE = "alfaleiloes"
API = "https://alfaleiloes.com/api"
STATUSES = ["Aberto", "Futuro", "Em breve"]
PAGE = 100
MAX = int(os.environ.get("GARIMPO_MAX", "0") or 0)

VEICULO = re.compile(r"\b(honda|fiat|chevrolet|chevr|volks|vw|toyota|hyundai|renault|ford|nissan|peugeot|citro|jeep|kia|mitsub|bmw|mercedes|audi|yamaha|suzuki|kawasaki|placa|chassi|renavam|moto\b|motocicleta|caminh[ãa]o|trator|reboque|ônibus|onibus|ve[ií]culo|elevacar|forno|máquina|maquina|equipamento|itens diversos|landing light)", re.I)
IMOVEL = re.compile(r"(im[óo]vel|apart|apto|casa|sobrado|terreno|lote\b|gleba|fazenda|s[ií]tio|ch[áa]cara|sala|loja|galp|pr[ée]dio|edif|vaga|garagem|box|comercial|residencial|rural|área|area|kitnet|flat|cobertura|barrac)", re.I)

def _get(s, url, params=None, tries=3):
    for i in range(tries):
        try:
            r = s.get(url, params=params, timeout=40)
            if r.status_code == 200:
                return r.json()
            print(f"[{FONTE}] HTTP {r.status_code} {url}", file=sys.stderr)
            if r.status_code == 404: return None
        except Exception as e:
            print(f"[{FONTE}] erro {e} {url}", file=sys.stderr)
        time.sleep(1.5 * (i + 1))
    return None

def _list(s):
    out, seen = [], set()
    for st in STATUSES:
        off = 0
        while True:
            d = _get(s, f"{API}/lotes/", {"status": st, "limit": PAGE, "offset": off})
            if not d: break
            res = d.get("results") or []
            for r in res:
                if r["id"] not in seen:
                    seen.add(r["id"]); out.append(r)
            print(f"[{FONTE}] status={st} offset={off} +{len(res)} (total {d.get('count')})", file=sys.stderr)
            if not d.get("next") or not res: break
            off += PAGE
            time.sleep(0.5)
            if MAX and len(out) >= MAX: return out[:MAX]
    return out

def _strip_html(h):
    if not h: return ""
    t = re.sub(r"<br\s*/?>|</p>|</div>|</li>", "\n", h)
    t = re.sub(r"<[^>]+>", " ", t)
    t = htmlmod.unescape(t)
    t = re.sub(r"[ \t\xa0]+", " ", t)
    return re.sub(r"\n\s*\n+", "\n", t).strip()

def _iso(dtstr):
    return dtstr[:10] if dtstr and re.match(r"\d{4}-\d{2}-\d{2}", dtstr) else None

def _is_imovel(r):
    t = f"{r.get('titulo') or ''} {r.get('subtitulo') or ''}"
    if not r.get("item"): return False  # lote órfão (sem leilão vinculado): lixo/antigo
    if re.search(r"\bteste?\b|\btest\b", t, re.I): return False
    if r.get("categoria") == 7 and r.get("subcategoria") in (28, 29): return False
    if VEICULO.search(t) and not IMOVEL.search(t): return False
    return bool(IMOVEL.search(t)) or tipo(t) != "outro"

def _build(r, lei):
    lei = lei or {}
    if re.search(r"encerrad|cancelad|suspens", lei.get("status") or "", re.I): return None
    titulo = (r.get("titulo") or "").strip()
    sub = r.get("subtitulo") or ""
    nome_lei = lei.get("nome") or ""
    desc = _strip_html(r.get("descricao"))
    uf = None
    m = re.search(r"\(([A-Z]{2})\)", titulo) or re.search(r"\(([A-Z]{2})\)", nome_lei) or re.search(r"/([A-Z]{2})\b", r.get("endereco") or "")
    if m: uf = m.group(1)
    if not uf and lei.get("estado"): uf = str(lei["estado"]).upper()[:2]
    if not uf: return None
    cid = None
    m = re.match(r"^\s*(.+?)\s*\(([A-Z]{2})\)", nome_lei)
    if m and m.group(2) == uf: cid = m.group(1).strip(" –-")
    if not cid:
        m = re.search(r"\bem\s+([^()\-–]+?)\s*\(" + uf + r"\)", titulo)
        if m: cid = m.group(1)
    if not cid:
        m = re.search(r",\s*([^,/–\-]+?)\s*/\s*" + uf + r"\b", r.get("endereco") or "")
        if m: cid = m.group(1)
    bairro = r.get("bairro") or None
    if not bairro:
        m = re.search(r"\bno\s+bairro\s+([^()]+?)\s*\(", titulo, re.I)
        if m: bairro = m.group(1).strip()
    aval = money(r.get("avaliacao"))
    l1, l2 = money(r.get("lance_1_data")), money(r.get("lance_2_data"))
    lance = money(r.get("valor_minimo")) or money(r.get("valor_atual")) or money(r.get("min_venda"))
    est = (lei.get("estagio_atual") or "").upper()
    praca = 2 if est.startswith("2") else (1 if est.startswith("1") else None)
    if praca is None and l1 and l2 and lance:
        praca = 2 if abs(lance - l2) < abs(lance - l1) and l1 != l2 else 1
    if not lance: lance = l2 if praca == 2 else l1
    if not aval: aval = l1 or lance
    if not lance or not aval: return None
    data_fim = _iso(r.get("fechamento")) or _iso(lei.get("data_final2") if praca == 2 else lei.get("data_final1"))
    data_ini = _iso(lei.get("data_inicial2") if praca == 2 else lei.get("data_inicial1"))
    tl = (r.get("tipo_leilao_read") or lei.get("tipo_leilao") or "").upper()
    if "EXTRA" in tl: modalidade = "extrajudicial"
    elif "JUDICIAL" in tl or "TRT" in tl: modalidade = "judicial"
    elif "ALIENA" in tl or "PARTICULAR" in tl: modalidade = "venda_direta"
    else: modalidade = "outro"
    tt = tipo(titulo)
    if tt == "outro": tt = tipo(sub)
    if tt == "outro" and re.search(r"vaga|garagem|box", titulo, re.I): tt = "outro"
    low = desc.lower()
    ocupado = None
    if re.search(r"\bdesocupad", low): ocupado = False
    elif re.search(r"\bocupad", low): ocupado = True
    mat = re.search(r"matr[ií]cula\(?s?\)?:?\s*(?:n[º°o.]*\s*)?([\d\.]{3,})", desc, re.I)
    cart = re.search(r"(\d{1,2}\s*[º°oa]?\s*(?:CRI|Cart[óo]rio|Of[ií]cio|Oficial|Registro)[^\.\n\-–,;]{0,60})", desc, re.I)
    cep = re.search(r"CEP:?\s*(\d{5}-?\d{3})", r.get("endereco") or "")
    area = money(r.get("metragem"))
    fl = flags(titulo + "\n" + desc)
    pag = _strip_html(r.get("compra_parcelada")).lower() + " " + (lei.get("condicao_pagamento") or "").lower()
    deb = None
    md = re.search(r"d[ée]bitos?[^.\n]{0,300}", desc, re.I)
    if md and re.search(r"iptu|condom", md.group(0), re.I): deb = md.group(0).strip()
    item = {
        "id": f"{FONTE}:{r['id']}",
        "fonte": FONTE,
        "url": f"https://alfaleiloes.com/lote/{r['id']}/",
        "tipo": tt,
        "titulo": titulo,
        "endereco": r.get("endereco") or None,
        "bairro": bairro,
        "cep": cep.group(1) if cep else None,
        "cidade": city(cid or ""),
        "uf": uf,
        "area_privativa_m2": area if tt in ("apartamento", "casa", "comercial") else None,
        "area_terreno_m2": area if tt in ("terreno", "rural") else None,
        "quartos": int(float(r["qtd_quartos"])) if r.get("qtd_quartos") else None,
        "vagas": int(float(r["qtd_vagas"])) if r.get("qtd_vagas") else None,
        "avaliacao": aval,
        "lance_minimo": lance,
        "desagio_pct": desagio(aval, lance),
        "modalidade": modalidade,
        "praca": praca,
        "data_leilao": data_fim or data_ini,
        "data_fim": data_fim,
        "lance_1a_praca": l1,
        "lance_2a_praca": l2,
        "leiloeiro": "Alfa Leilões",
        "processo": r.get("num_processo") or None,
        "vara": " - ".join(x for x in (r.get("vara"), lei.get("forum")) if x) or None,
        "matricula": mat.group(1) if mat else None,
        "cartorio": cart.group(1).strip() if cart else None,
        "ocupado": ocupado,
        "edital_url": (lei.get("edital") or "").split("?")[0] or None,
        "aceita_financiamento": True if "financ" in pag else None,
        "aceita_fgts": True if "fgts" in pag else None,
        "debitos_regra": deb,
        "direitos_fiduciante": fl["direitos_fiduciante"],
        "fracao_ideal": fl["fracao_ideal"],
        "descricao": desc[:6000],
        "status_fonte": r.get("status"),
        "coletado_em": now_iso(),
    }
    return {k: v for k, v in item.items() if v is not None or k in ("praca", "ocupado", "data_leilao")}

def collect():
    s = session()
    s.headers["Accept"] = "application/json"
    lots = _list(s)
    lots = [r for r in lots if _is_imovel(r)]
    print(f"[{FONTE}] {len(lots)} lotes de imóveis ativos; buscando leilões...", file=sys.stderr)
    cache, items, seen = {}, [], set()
    for i, r in enumerate(lots, 1):
        try:
            lid = r.get("item")
            if lid and lid not in cache:
                cache[lid] = _get(s, f"{API}/leiloes/{lid}/") or {}
                time.sleep(0.3)
            it = _build(r, cache.get(lid))
            if it and it["id"] not in seen:
                seen.add(it["id"]); items.append(it)
        except Exception as e:
            print(f"[{FONTE}] falha lote {r.get('id')}: {e}", file=sys.stderr)
        if i % 50 == 0: print(f"[{FONTE}] {i}/{len(lots)}", file=sys.stderr)
    return items

if __name__ == "__main__":
    save_raw(FONTE, collect())
