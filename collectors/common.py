"""Utilitários compartilhados pelos coletores."""
import json, os, re, unicodedata, datetime as dt

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "data", "raw")
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"

def session():
    import requests  # import tardio: o build roda sem a dependencia instalada
    s = requests.Session()
    s.headers.update({"User-Agent": UA, "Accept-Language": "pt-BR,pt;q=0.9"})
    return s

def now_iso():
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()

def money(s):
    """'R$ 123.456,78' -> 123456.78"""
    if s is None: return None
    if isinstance(s, (int, float)): return float(s)
    s = re.sub(r"[^\d,\.]", "", str(s))
    if not s: return None
    if "," in s: s = s.replace(".", "").replace(",", ".")
    try: return float(s)
    except ValueError: return None

def strip_accents(s):
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")

def city(s):
    if not s: return ""
    s = re.sub(r"\s+", " ", str(s)).strip()
    return " ".join(w.capitalize() if len(w) > 2 else w.lower() for w in s.split(" "))

def tipo(s):
    t = strip_accents((s or "").lower())
    for k, v in [("apart", "apartamento"), ("casa", "casa"), ("sobrado", "casa"), ("terreno", "terreno"), ("lote", "terreno"),
                 ("gleba", "terreno"), ("comerc", "comercial"), ("loja", "comercial"), ("sala", "comercial"), ("galp", "comercial"),
                 ("predio", "comercial"), ("rural", "rural"), ("chacara", "rural"), ("sitio", "rural"), ("fazenda", "rural")]:
        if k in t: return v
    return "outro"

def desagio(avaliacao, lance):
    if not avaliacao or not lance or avaliacao <= 0: return 0.0
    return round(max(0.0, 1 - lance / avaliacao), 4)

def flags(texto):
    """Vetos: venda de direitos de fiduciante e venda de fração/parte ideal.
    Ignora "fração ideal no/do terreno" (texto padrão de matrícula de apartamento)."""
    t = strip_accents((texto or "").lower())
    t = re.sub(r"fracao ideal[^.;]{0,40}?(no|do|de|sobre o|correspondente ao) (terreno|solo|lote|condominio)", " ", t)
    t = re.sub(r"fracao ideal (de|correspondente a) [\d.,]+ ?%? ?(m2|do terreno|das coisas|das partes|nas partes|das areas)", " ", t)
    fracao = bool(re.search(
        # "metade ideal", "parte ideal" e "quinhão" só aparecem quando se vende um pedaço: veto direto.
        # "fração ideal" não entra aqui porque é texto padrão de matrícula de apartamento, e as
        # ocorrências inofensivas já foram retiradas acima.
        r"\b(metade|parte|quinhao) ideal"
        r"|(venda|leilao|arrematacao|alienacao|direitos|penhora)[^.;]{0,60}(fracao|parte|metade|quinhao) ideal"
        r"|(fracao|parte|metade|quinhao) ideal (de|correspondente a|equivalente a) [\d.,]+ ?%"
        # Aceita com e sem parênteses: "50% do imóvel" e "METADE IDEAL (50%) DO IMÓVEL".
        r"|\(?\b\d{1,2}([.,]\d+)? ?%\)? (da |de |do |dos )?(imovel|fracao|parte ideal|direitos|propriedade|nua propriedade)"
        r"|\b(50|33|25|20)% ?\(", t))
    return {
        # Venda de DIREITOS (aquisitivos, do compromissário, do fiduciante) em vez da propriedade.
        "direitos_fiduciante": bool(re.search(
            r"direitos? (do |de |da |dos )?(devedor |mutuario |parte executada )?fiduciante"
            r"|direitos? aquisitivos?[^.;]{0,120}fiducia"
            r"|devedora? fiduciante"
            r"|cessao (de |dos )?direitos fiduciari", t)),
        "direitos_aquisitivos": bool(re.search(
            r"direitos? aquisitivos?|direitos? (sobre|do|da) (o )?imovel|direitos? (do |da )?compromissari"
            r"|direitos? possessorios|cessao (de |dos )?direitos", t)),
        "fracao_ideal": fracao,
        # Enfiteuse: vende-se só o domínio útil (foro anual + laudêmio de 5% na revenda + anuência da SPU).
        "dominio_util": bool(re.search(r"dominio util|enfiteuse|enfiteutico|aforamento|terreno de marinha", t)),
        # Ônus ainda averbado que o comprador terá de cancelar por conta própria.
        "onus_averbado": bool(re.search(
            r"(gravame|penhora|indisponibilidade)[^.;]{0,60}averbad"
            r"|regularizacao por conta do adquirente"
            r"|onus[^.;]{0,40}por conta do (adquirente|comprador)", t)),
        # Massa falida: venda pelo juízo falimentar (costuma ser livre de ônus, mas o rito é longo).
        "massa_falida": bool(re.search(r"massa falida|falencia|juizo falimentar|recuperacao judicial", t)),
    }

def save_raw(fonte, items):
    os.makedirs(RAW, exist_ok=True)
    path = os.path.join(RAW, f"{fonte}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, indent=1)
    print(f"[{fonte}] {len(items)} imóveis -> {path}")
    return path


# --------------------------------------------------------------------------
# Extração de campos a partir do texto livre (título / descrição / detalhe).
# --------------------------------------------------------------------------

_EXTENSO = {"um": 1, "uma": 1, "dois": 2, "duas": 2, "tres": 3, "quatro": 4, "cinco": 5,
            "seis": 6, "sete": 7, "oito": 8, "nove": 9, "dez": 10}
# número em algarismo (01, 3) ou por extenso, seguido opcionalmente de "(dois)"
_NUM = r"(\d{1,3}|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez)\s*(?:\([a-z]+\)\s*)?"
_M2 = r"(?:m2|m²|metros quadrados|metros²)"

def _int_pt(s):
    """'03' -> 3; 'tres' -> 3; None se não der."""
    s = (s or "").strip().lower()
    if s.isdigit(): return int(s)
    return _EXTENSO.get(s)

def _float_pt(s):
    """'1.161,39' -> 1161.39; '63.9' -> 63.9; '4.035' -> 4035; '21.37.50' -> None."""
    s = (s or "").strip().rstrip(".,")
    if not s or not any(c.isdigit() for c in s): return None
    if "," in s:
        s = s.replace(".", "").replace(",", ".")
    elif s.count(".") > 1:
        return None  # formato ambíguo tipo "21.37.50"
    elif "." in s:
        inteiro, _, dec = s.partition(".")
        if len(dec) == 3 and inteiro:  # 4.035 = separador de milhar
            s = inteiro + dec
    try: return float(s)
    except ValueError: return None

def _casa_areas(texto, padroes):
    """Todos os pares (posição, valor) plausíveis casados pelos padrões."""
    vals = []
    for p in padroes:
        for m in re.finditer(p, texto):
            v = _float_pt(m.group(1))
            if v is not None and 10 <= v <= 100000: vals.append((m.start(), v))
    return vals

def _maior(texto, padroes):
    v = _casa_areas(texto, padroes)
    return max(x for _, x in v) if v else None

def _primeiro(texto, padroes):
    """Primeira menção no texto: costuma ser a área "de manchete" do imóvel."""
    v = _casa_areas(texto, padroes)
    return sorted(v)[0][1] if v else None

# quartos: "Dormitórios: 3", "03 dormitórios", "2 qts", "dois quartos", "3 dorms"
_RE_QUARTOS_ESTRUT = re.compile(r"(?:dormitorios?|quartos?)\s*:\s*(\d{1,2})")
_RE_QUARTOS = re.compile(_NUM + r"(?:amplos?\s+|grandes?\s+|bons?\s+|otimos?\s+)?"
                                r"(?:dormitorios?|dorms?\b|dorm\.|quartos?\b|qtos?\b|qts?\b)")
_RE_SUITES = re.compile(_NUM + r"suites?\b")
# vagas: "Vagas de garagem: 2", "1 vaga(s) de garagem", "duas vagas", "garagem para 2 carros"
_RE_VAGAS_ESTRUT = re.compile(r"vagas? de garagem\s*:\s*(\d{1,2})")
_RE_VAGAS = re.compile(_NUM + r"vagas?\b")
_RE_VAGAS_PARA = re.compile(r"(?:garagem|estacionamento|vagas?)\s+(?:para|de)\s+" + _NUM +
                            r"(?:carros?|veiculos?|automoveis?|autos?)\b")
# área privativa / útil (prioridade 1), construída (2), total (3, só apartamento pequeno)
_RE_PRIV = [r"area (?:real |privativa )?(?:privativa|util)(?: real| coberta| principal| somada| edificada)?"
            r"\s*(?:de|:|e de|igual a|com)?\s*([\d.,]+)\s*" + _M2,
            r"([\d.,]+)\s*" + _M2 + r"[^.;\d]{0,12}?de area (?:real )?(?:privativa|util)",
            r"area priv\.?\s*:?\s*([\d.,]+)\s*" + _M2]
_RE_CONSTR = [r"area (?:total )?construida\s*(?:de|:|e de|com)?\s*([\d.,]+)\s*" + _M2,
              r"([\d.,]+)\s*" + _M2 + r"[^.;\d]{0,12}?de area (?:total )?construida",
              r"constr\.\s*([\d.,]+)\s*" + _M2]
_RE_TOTAL = [r"area (?:real )?total\s*(?:de|:|e de|com)?\s*([\d.,]+)\s*" + _M2,
             r"([\d.,]+)\s*" + _M2 + r"[^.;\d]{0,12}?de area (?:real )?total"]
_RE_TERRENO = [r"area (?:total )?d[oe] terreno\s*(?:de|:|e de|com)?\s*([\d.,]+)\s*" + _M2,
               r"([\d.,]+)\s*" + _M2 + r"[^.;\d]{0,20}?de area (?:total )?(?:d[oe] )?terreno",
               r"terrenos?\s*(?:de|com|c/|medindo|mede|com a? ?area (?:total )?de)?\s*:?\s*([\d.,]+)\s*" + _M2,
               r"terr\.\s*([\d.,]+)\s*" + _M2]
# imóvel que é só terra (nesse caso "área total" = área do terreno)
_RE_SO_TERRA = re.compile(r"\b(lote|terreno|gleba|chacara|sitio|fazenda|area de terra|data de terras|terras)\b")
_RE_EDIFICADO = re.compile(r"\b(apartamento|apto|casa|sobrado|predio|edificio|galpao|sala comercial|loja|barracao|"
                           r"benfeitoria|edificad|construid|residencia|unidade autonoma|box)\b")
_RE_MEDINDO = [r"(?:medindo|com area de|com a area de|area de)\s*(?:aproximadamente\s*)?([\d.,]+)\s*" + _M2]
# ocupação
_RE_DESOCUPACAO_COMPRADOR = re.compile(
    r"desocupacao[^.;]{0,80}?(?:por conta|a cargo|sob responsabilidade|de responsabilidade)"
    r"[^.;]{0,20}?d[oa]s? (?:comprador|arrematante|adquirente|licitante|proponente)"
    r"|(?:ficara?o?|correra?o?) (?:a cargo|por conta) d[oa]s? (?:comprador|arrematante|adquirente)"
    r"[^.;]{0,120}?desocupacao")
_RE_OCUPADO = re.compile(r"(?<!des)\bocupad[oa]s?\b|imovel ocupado|ocupado por (?:terceiros|locatario|inquilino|posseiro)")
_RE_CONDICIONAL = re.compile(
    r"(?:se|caso|quando)\s+(?:o\s+|a\s+)?(?:imovel|bem|unidade)\s+"
    r"(?:estiver|esteja|estejam|se encontre|encontrar-se|for|estivesse)[^.;]{0,120}"
    r"|eventuais? ocupa\w+"
    r"|em caso de (?:imovel )?ocupa\w+")
_RE_DESOCUPADO = re.compile(r"\bdesocupad[oa]s?\b|livre de ocupacao|livre e desimpedido de pessoas|sem ocupantes")

def extrair_do_texto(texto):
    """Lê título/descrição em pt-BR e devolve o que der para inferir.

    Só devolve valores plausíveis; o build aplica apenas onde o coletor não trouxe nada.
    Chaves possíveis: quartos, vagas, area_privativa_m2, area_terreno_m2, ocupado.
    """
    if not texto: return {}
    t = strip_accents(str(texto).lower())
    t = re.sub(r"\s+", " ", t)
    out = {}

    # --- quartos (suíte só conta quando não há dormitório/quarto) ---
    q = [int(m.group(1)) for m in _RE_QUARTOS_ESTRUT.finditer(t)]
    if not q: q = [n for n in (_int_pt(m.group(1)) for m in _RE_QUARTOS.finditer(t)) if n]
    if not q: q = [n for n in (_int_pt(m.group(1)) for m in _RE_SUITES.finditer(t)) if n]
    q = [n for n in q if 1 <= n <= 20]
    if q: out["quartos"] = max(q)

    # --- vagas ---
    v = [int(m.group(1)) for m in _RE_VAGAS_ESTRUT.finditer(t)]
    if not v:
        v = [n for n in (_int_pt(m.group(1)) for m in _RE_VAGAS.finditer(t)) if n]
        v += [n for n in (_int_pt(m.group(1)) for m in _RE_VAGAS_PARA.finditer(t)) if n]
    v = [n for n in v if 1 <= n <= 50]
    if v: out["vagas"] = max(v)

    # --- áreas ---
    terreno = _maior(t, _RE_TERRENO)
    if terreno is None and _RE_SO_TERRA.search(t) and not _RE_EDIFICADO.search(t):
        # imóvel que é só terra: "área total" / "medindo" é a área do terreno mesmo
        terreno = _maior(t, _RE_TOTAL) or _maior(t, _RE_MEDINDO)
    if terreno is not None: out["area_terreno_m2"] = terreno
    priv = _primeiro(t, _RE_PRIV)
    if priv is None: priv = _primeiro(t, _RE_CONSTR)
    if priv is None:
        # "área total" é ambígua (em apartamento inclui área comum): só aceita se for pequena
        tot = _primeiro(t, _RE_TOTAL)
        if tot is not None and tot <= 500 and re.search(r"\bapartamento|\bapto\b|\bap\.\b|unidade autonoma", t):
            priv = tot
    if priv is not None: out["area_privativa_m2"] = priv

    # --- ocupação ---
    # tira cláusula condicional genérica de edital ("se o imóvel estiver ocupado por terceiros...")
    to = _RE_CONDICIONAL.sub(" ", t)
    ocup = bool(_RE_OCUPADO.search(to) or _RE_DESOCUPACAO_COMPRADOR.search(to))
    desocup = bool(_RE_DESOCUPADO.search(to))
    if ocup and not desocup: out["ocupado"] = True
    elif desocup and not ocup: out["ocupado"] = False
    # texto que afirma as duas coisas: não dá para decidir, deixa em branco
    return out


# --------------------------------------------------------------------------
# Prédio e unidade (espelho do condomínio)
# --------------------------------------------------------------------------
# Onde o endereço deixa de ser o prédio e passa a ser a unidade, o bloco ou o loteamento.
_RE_CORTE_PREDIO = re.compile(r"[,\s]+(?:apto?|apart\w*|unidade|und|bl|bloco|torre|lt|qd|lote|quadra|cj|conj|"
                              r"pavimento|andar|cep|vg|box)\b|\s-\s")
_RE_UNIDADE = re.compile(r"\b(?:apto?|apart(?:amento)?|unidade|und)\b\.?\s*(?:n[o°º]?\.?\s*)?(?:ap\.?\s*)?(\d{1,4})([a-d])?\b"
                         r"(?![/,.]\d|/|\s*(?:\(|dorm|quart|qto|suite|vaga|m2|m²|m\b|metro|banh|sala|wc|pav|andar|ambiente|comodo))")
_RE_BLOCO = re.compile(r"\b(bl(?:oco)?|torre)\b\.?\s*(?:n[o°º]?\.?\s*)?(\d{1,3}[a-z]?|[a-z])(?:\s*/\s*([a-z0-9]))?\b")
_RE_ANDAR = re.compile(r"\b(\d{1,2})\s*[º°o]?\s*(?:andar|pavimento)\b")
_RE_TERREO = re.compile(r"\bterreo\b")
_RE_SN = re.compile(r"^(?:sn|s/?n[o°º]?|0+)$")
_RE_LT = re.compile(r"\b(?:lt|lote)\b\.?\s*([0-9][0-9a-z-]*)")
_RE_QD = re.compile(r"\b(?:qd|quadra)\b\.?\s*([0-9a-z][0-9a-z-]*)")
_RE_NOME_COND = re.compile(r"\b(?:lot|loteamento|residencial|res|cond|condominio|edificio|ed|conjunto)\b\.?\s+([a-z0-9 ]{3,40})")
_VIA_PREFIXO = re.compile(r"^(?:r|rua|av|avda|avenida|al|alameda|tv|trav|travessa|est|estr|estrada|rod|rodovia|pca|praca|"
                          r"lgo|largo|vl|vila|via|viela|servidao|ladeira|acesso|marginal|anel|beco)\b\.?\s*")
_VIA_ABREV = {"dr": "doutor", "dra": "doutora", "prof": "professor", "profa": "professora", "eng": "engenheiro", "cel": "coronel",
              "gal": "general", "gen": "general", "pres": "presidente", "pe": "padre", "sen": "senador", "cap": "capitao",
              "ten": "tenente", "mal": "marechal", "alm": "almirante", "des": "desembargador", "ver": "vereador",
              "dep": "deputado", "sta": "santa", "sto": "santo", "sra": "senhora", "gov": "governador",
              "brig": "brigadeiro", "comend": "comendador", "maj": "major", "sgt": "sargento", "mons": "monsenhor"}
_VIA_VAZIAS = {"de", "da", "do", "das", "dos", "e"}

def _limpo(s):
    return re.sub(r"\s+", " ", strip_accents(str(s or "").lower())).strip()

def _via_norm(via):
    v = re.sub(r"[^a-z0-9 ]+", " ", via).strip()
    v = _VIA_PREFIXO.sub("", v)
    return "".join(_VIA_ABREV.get(p, p) for p in v.split() if p not in _VIA_VAZIAS)

def _posicao(digitos, bloco):
    """'1203' -> (12, '03'); '52' -> (5, '2'); '101' -> (1, '01'); '001' -> (0, '01'). Sem leitura segura: (None, None)."""
    d = digitos
    if len(d) == 4 and bloco and d[:2].lstrip("0") == bloco.lstrip("0"):
        d = d[2:]                      # "2245" no BL 22 = unidade 45 do bloco 22
    if len(d) == 2: andar, final = int(d[0]), d[1]
    elif len(d) == 3: andar, final = int(d[0]), d[1:]
    elif len(d) == 4: andar, final = int(d[:2]), d[2:]
    else: return None, None
    if int(final) == 0 or andar > 60: return None, None
    return andar, final

def predio_e_unidade(it):
    """Para apartamento: {predio_id, bloco, unidade, andar, final}, só o que der para ler com segurança.

    predio_id = hash curto de UF + cidade + via + número. Endereço sem número só vira prédio com
    outro sinal (lote/quadra, nome do condomínio ou CEP), porque "Estrada X, s/n" sozinho junta
    condomínios diferentes da mesma estrada.
    """
    if it.get("tipo") != "apartamento": return {}
    import hashlib
    end = _limpo(it.get("endereco"))
    out = {}

    # bloco / torre ("BL 09", "BL.05", "BLOCO A", "TORRE 4", "BL 07/A")
    partes = []
    for m in _RE_BLOCO.finditer(end):
        rot = "Torre" if m.group(1) == "torre" else "Bloco"
        v = m.group(2).upper().lstrip("0") or "0"
        if m.group(3): v += "/" + m.group(3).upper()
        p = f"{rot} {v}"
        if p not in partes: partes.append(p)
    if partes: out["bloco"] = ", ".join(partes[:2])

    # unidade e posição: o endereço manda; título e começo da descrição só se ele não trouxer
    txt = end
    m = _RE_UNIDADE.search(txt)
    if not m:
        txt = _limpo(it.get("titulo")) + " " + _limpo(str(it.get("descricao") or "")[:300])
        m = _RE_UNIDADE.search(txt)
    if m:
        dig = m.group(1)
        out["unidade"] = dig + (m.group(2) or "").upper()
        num_bloco = re.sub(r"\D", "", partes[0]) if partes else ""
        andar, final = _posicao(dig, num_bloco)
        # andar escrito por extenso perto da unidade ("apto 101, no 10º andar") vence a leitura dos dígitos
        explicito = _RE_ANDAR.search(txt[m.end():m.end() + 80]) or (_RE_ANDAR.search(end) if txt is not end else None)
        if final is not None:
            if _RE_TERREO.search(end): andar = 0
            elif explicito and int(explicito.group(1)) <= 60:
                andar = int(explicito.group(1)); a = str(andar)
                if dig.startswith(a) and len(dig) > len(a) and int(dig[len(a):]) > 0: final = dig[len(a):]
        if andar is not None and final is not None:
            out["andar"], out["final"] = andar, final

    # prédio: via + número, cortando unidade, bloco, bairro e CEP
    base = _RE_CORTE_PREDIO.split(end, maxsplit=1)[0]
    if "," in base:
        via, resto = base.split(",", 1)
        mn = re.search(r"(\d+[a-z]?|s\s*/?\s*n[o°º]?|sn)\b", resto)
        numero = mn.group(1) if mn else ""
    else:
        m = re.match(r"^(.*?)\s+(?:n[o°º]?\.?\s*)?(\d+[a-z]?|s/?n|sn)\s*$", base)
        via, numero = (m.group(1), m.group(2)) if m else (base, "")
    via = _via_norm(re.sub(r"\bn[o°º]?\.?\s*$", "", via.strip()))
    cidade = re.sub(r"[^a-z0-9]", "", _limpo(it.get("cidade")))
    if len(via) < 4 or not cidade: return out
    numero = re.sub(r"\s", "", numero)
    if not numero or _RE_SN.match(numero):
        sinais = []
        lt, qd = _RE_LT.search(end), _RE_QD.search(end)
        if lt: sinais.append("lt" + lt.group(1))
        if qd: sinais.append("qd" + qd.group(1))
        nome = _RE_NOME_COND.search(end)
        if nome: sinais.append("n" + re.sub(r"[^a-z0-9]", "", nome.group(1)))
        cep = re.sub(r"\D", "", str(it.get("cep") or ""))
        if len(cep) == 8: sinais.append("c" + cep)
        if not sinais: return out
        numero = "sn|" + "|".join(sinais)
    else:
        numero = numero.lstrip("0") or "0"
    chave = f"{it.get('uf')}|{cidade}|{via}|{numero}"
    out["predio_id"] = hashlib.sha1(chave.encode()).hexdigest()[:12]
    return out
