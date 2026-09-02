"""Junta data/raw/*.json, deduplica e grava data/imoveis.json + data/meta.json.

Uso: python3 collectors/build.py            (só junta o que já existe em data/raw)
     python3 collectors/build.py --collect  (roda todos os coletores antes)
"""
import glob, importlib, json, os, re, sys, traceback, datetime as dt
from collections import Counter
from common import ROOT, RAW, now_iso, strip_accents, flags, desagio, extrair_do_texto

# Toda fonte é um módulo collectors/<fonte>.py com collect(); descoberta automática.
FONTES = sorted(os.path.basename(f)[:-3] for f in glob.glob(os.path.join(os.path.dirname(os.path.abspath(__file__)), "*.py"))
                if os.path.basename(f) not in ("build.py", "common.py"))
UFS = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"]
OBRIG = ["id", "fonte", "url", "tipo", "titulo", "cidade", "uf", "avaliacao", "lance_minimo", "desagio_pct", "modalidade",
         "direitos_fiduciante", "fracao_ideal", "coletado_em"]
# Campos usados para eleger o registro "principal" numa mesclagem (o mais completo vence).
CAMPOS_RIQUEZA = ["quartos", "vagas", "area_privativa_m2", "area_terreno_m2", "ocupado", "matricula", "cartorio",
                  "bairro", "endereco", "cep", "descricao", "descricao_detalhe", "edital_url", "matricula_url",
                  "praca", "data_leilao", "data_fim", "aceita_financiamento", "aceita_fgts", "debitos_regra",
                  "debitos_por_conta_comprador", "lat", "lng", "processo"]

def run_collectors():
    sys.path.insert(0, os.path.dirname(__file__))
    for f in FONTES:
        if not os.path.exists(os.path.join(os.path.dirname(__file__), f + ".py")): continue
        try:
            mod = importlib.import_module(f)
            items = mod.collect()
            from common import save_raw
            save_raw(f, items)
        except Exception:
            print(f"[{f}] FALHOU"); traceback.print_exc()

# --------------------------------------------------------------------------
# Dedupe multi-chave entre fontes
# --------------------------------------------------------------------------
# Prefixos de logradouro que uma fonte escreve e a outra não ("R." x "Rua" x nada).
_PREFIXO_VIA = re.compile(r"^(r|rua|av|avenida|al|alameda|tv|trav|travessa|est|estrada|rod|rodovia|pca|praca|"
                          r"lgo|largo|vl|vila|jd|jardim|via|viela|servidao|ladeira|acesso|marginal|anel)\.?\s+")
_SEM_NUMERO = re.compile(r"\b(s\s*/?\s*n\s*[o°º]?|sem numero|numero zero)\b")

def norm_cidade(it):
    return re.sub(r"[^a-z0-9]", "", strip_accents((it.get("cidade") or "").lower()))

def norm_endereco(end):
    """'Rua Padre Donizete, 396' -> ('padredonizete396', True).

    Mantém lote/quadra/apto/bloco: são justamente o que separa dois imóveis do
    mesmo endereço. Só some o que é ruído de grafia (prefixo da via, "nº", "s/n", "0").
    """
    e = strip_accents((end or "").lower())
    e = re.sub(r"n[o°ºª]?\.?\s*(?=\d)", " ", e)       # "nº 396" / "N. 396" -> "396"
    e = re.sub(r"[^a-z0-9]+", " ", e).strip()
    e = _PREFIXO_VIA.sub("", e)
    e = _SEM_NUMERO.sub(" ", e)
    e = re.sub(r"\b0+\b", " ", e)                    # "Rua X, 0" = sem número
    e = re.sub(r"\s+", " ", e).strip()
    chave = re.sub(r"[^a-z0-9]", "", e)
    return chave, bool(re.search(r"\d", e))

def end_conflita(a, b):
    """Dois endereços normalizados que não se contêm apontam imóveis diferentes."""
    ea, _ = norm_endereco(a.get("endereco")); eb, _ = norm_endereco(b.get("endereco"))
    if len(ea) < 8 or len(eb) < 8: return False
    return ea not in eb and eb not in ea

def so_digitos_matricula(it):
    d = re.sub(r"\D", "", str(it.get("matricula") or ""))
    return d.lstrip("0") if len(d) >= 3 else ""

def chaves(it):
    """Chaves candidatas do item. Bater QUALQUER uma sugere duplicata."""
    ks = []
    cid = norm_cidade(it)
    mat = so_digitos_matricula(it)
    if mat and cid: ks.append("m:" + mat + "|" + cid)
    via, tem_num = norm_endereco(it.get("endereco"))
    if len(via) >= 8 and cid:
        if tem_num: ks.append("e:" + via + "|" + cid)
        else:
            # sem número: só casa com outro sem número, e ainda amarrado ao bairro
            bai = re.sub(r"[^a-z0-9]", "", strip_accents((it.get("bairro") or "").lower()))
            ks.append("e2:" + via + "|" + bai + "|" + cid)
    return ks

def compativel(a, b, chave):
    """Trava de falso positivo: apartamentos do mesmo prédio não são o mesmo lote."""
    if end_conflita(a, b): return False               # endereços incompatíveis (nº/lote/apto)
    ma, mb = so_digitos_matricula(a), so_digitos_matricula(b)
    if ma and mb and ma != mb: return False           # matrículas diferentes = imóveis diferentes
    if chave.startswith("m:"): return True            # mesma matrícula na mesma cidade
    if ma and mb: return True
    aa, ab = a.get("avaliacao") or 0, b.get("avaliacao") or 0
    pa, pb = a.get("area_privativa_m2"), b.get("area_privativa_m2")
    mesma_area = pa is not None and pb is not None and abs(pa - pb) < 0.5
    if chave.startswith("e2:"):
        # endereço sem número: chave fraca. Só aceita entre fontes diferentes (o mesmo
        # site raramente publica o mesmo lote duas vezes) e com valor praticamente igual.
        if a.get("fonte") == b.get("fonte"): return False
        return mesma_area or (aa > 0 and ab > 0 and abs(aa - ab) <= 0.01 * max(aa, ab))
    if aa > 0 and ab > 0 and abs(aa - ab) <= 0.15 * max(aa, ab): return True
    return mesma_area

def riqueza(it):
    return sum(1 for k in CAMPOS_RIQUEZA if it.get(k) not in (None, "", [])) + len(it.get("fotos") or [])

def mesclar(a, b):
    """Funde dois registros do mesmo imóvel. Principal = o mais completo."""
    principal, outro = (a, b) if riqueza(a) >= riqueza(b) else (b, a)
    m = dict(principal)
    for k, v in outro.items():
        if k in ("id", "fonte", "url", "tambem_em", "fotos", "coletado_em"): continue
        if m.get(k) in (None, "", []) and v not in (None, "", []): m[k] = v
    # fotos: união, as do principal primeiro
    vistas, fotos = set(), []
    for u in (principal.get("fotos") or []) + (outro.get("fotos") or []):
        if u and u not in vistas: vistas.add(u); fotos.append(u)
    if fotos: m["fotos"] = fotos
    # avaliação: fica a do principal; a divergente da outra fonte fica registrada
    av_p, av_o = principal.get("avaliacao"), outro.get("avaliacao")
    if av_p and av_o and abs(av_p - av_o) > 0.01: m["avaliacao_outra_fonte"] = av_o
    elif principal.get("avaliacao_outra_fonte") is not None: m["avaliacao_outra_fonte"] = principal["avaliacao_outra_fonte"]
    # lance: o menor dos dois
    lances = [x for x in (principal.get("lance_minimo"), outro.get("lance_minimo")) if x]
    if lances: m["lance_minimo"] = min(lances)
    m["desagio_pct"] = desagio(m.get("avaliacao"), m.get("lance_minimo"))
    # tambem_em: as outras fontes do mesmo imóvel, sem repetir
    tam, urls = [], {m["url"]}
    for e in (principal.get("tambem_em") or []) + (outro.get("tambem_em") or []) + \
             [{"fonte": outro["fonte"], "url": outro["url"], "lance_minimo": outro.get("lance_minimo")}]:
        if e.get("url") and e["url"] not in urls: urls.add(e["url"]); tam.append(e)
    if tam: m["tambem_em"] = tam
    return m

# --------------------------------------------------------------------------
# Fotos em resolução maior (só reescritas comprovadas por HEAD 200)
# --------------------------------------------------------------------------
def foto_grande(u):
    if not isinstance(u, str) or not u: return u
    if "megaleiloes.com.br" in u:                      # _670x380.jpg -> _1024x768.jpg
        return re.sub(r"_670x380(\.\w+)$", r"_1024x768\1", u)
    if "frazaoleiloes.com.br" in u:                    # /images/lot/xx/yy/500/ -> /1000/
        return re.sub(r"(/images/lot/\d+/\d+)/500/", r"\1/1000/", u)
    if "sbwebservices.net" in u:                       # superbid: tira o redimensionamento
        return re.sub(r"\?(?:w|h|width|height)=[^#]*", "", u)
    return u

# --------------------------------------------------------------------------
def valid(it):
    faltam = [k for k in OBRIG if it.get(k) is None]
    if faltam: return False
    return it["avaliacao"] > 0 and it["lance_minimo"] > 0 and it["uf"] in UFS

def suspeito(it):
    """Lance simbólico ou avaliação errada: deságio absurdo / valores fora de escala."""
    av, la = (it.get("avaliacao") or 0), (it.get("lance_minimo") or 0)
    # Lance acima da avaliação NÃO é suspeito: no 2º leilão SFI da Caixa o mínimo é a dívida, que pode passar da avaliação.
    return bool(it.get("desagio_pct", 0) >= 0.85 or av < 5000 or la < 1000)

def main():
    if "--collect" in sys.argv: run_collectors()
    seen, out, stats = {}, [], {}
    merges = Counter(); exemplos = []; preenchidos = Counter()
    for path in sorted(glob.glob(os.path.join(RAW, "*.json"))):
        fonte = os.path.basename(path)[:-5]
        try: items = json.load(open(path, encoding="utf-8"))
        except Exception as e: print(f"[{fonte}] ilegível: {e}"); continue
        ok = 0
        for it in items:
            if not valid(it): continue
            texto = f"{it.get('titulo','')} {it.get('descricao','')} {it.get('descricao_detalhe','')}"
            fl = flags(texto)
            it["direitos_fiduciante"] = bool(it.get("direitos_fiduciante")) or fl["direitos_fiduciante"]
            it["fracao_ideal"] = fl["fracao_ideal"]
            it["dominio_util"] = fl["dominio_util"]
            it["direitos_aquisitivos"] = fl["direitos_aquisitivos"]
            it["onus_averbado"] = fl["onus_averbado"] or bool(re.search(r"(gravame|penhora|indisponibilidade).{0,60}averbad|regularização por conta do adquirente", (it.get("debitos_regra") or ""), re.I))
            it["massa_falida"] = fl["massa_falida"]
            # campos que o coletor não trouxe: tenta ler do texto (nunca sobrescreve)
            extraido = extrair_do_texto(texto)
            for k, v in extraido.items():
                if it.get(k) is None:
                    it[k] = v; preenchidos[(fonte, k)] += 1
            if it.get("fotos"):
                it["fotos"] = [foto_grande(u) for u in it["fotos"]]

            ks = chaves(it)
            alvo = None
            for k in ks:
                for i in seen.get(k, ())[:40]:
                    if compativel(it, out[i], k): alvo = i; break
                if alvo is not None: break
            if alvo is not None:
                antigo = out[alvo]
                par = tuple(sorted({antigo["fonte"], it["fonte"]}))
                if len(par) == 2:
                    merges[par] += 1
                    if len(exemplos) < 5 and antigo["fonte"] != it["fonte"]:
                        exemplos.append((antigo["id"], it["id"]))
                novo = mesclar(antigo, it)
                out[alvo] = novo
                for k in ks + chaves(novo):
                    lst = seen.setdefault(k, [])
                    if alvo not in lst: lst.append(alvo)
                continue
            idx = len(out); out.append(it); ok += 1
            for k in ks: seen.setdefault(k, []).append(idx)
        stats[fonte] = {"lidos": len(items), "validos": ok}
        print(f"[{fonte}] {len(items)} lidos, {ok} válidos únicos")

    for it in out:
        if suspeito(it): it["valor_suspeito"] = True

    out.sort(key=lambda x: -x["desagio_pct"])
    json.dump(out, open(os.path.join(ROOT, "web", "data", "imoveis.json"), "w", encoding="utf-8"), ensure_ascii=False)
    # índice enxuto para as listas (o JSON completo fica só no servidor, na página do lote)
    CAMPOS = ["id","fonte","tipo","endereco","bairro","cidade","uf","area_privativa_m2","area_terreno_m2","quartos","vagas",
              "avaliacao","lance_minimo","desagio_pct","modalidade","praca","data_leilao","ocupado","aceita_financiamento",
              "aceita_fgts","direitos_fiduciante","fracao_ideal","dominio_util","massa_falida","direitos_aquisitivos",
              "onus_averbado","matricula","debitos_por_conta_comprador","valor_suspeito"]
    import re as _re
    idx = []
    for it in out:
        r = {k: it[k] for k in CAMPOS if it.get(k) is not None}
        f = it.get("fotos") or []
        if f: r["foto"] = f[0]
        d = it.get("debitos_regra") or ""
        if _re.search(r"10% (em rela..o a|do valor de) avalia", d, _re.I): r["debitos_teto10"] = True
        idx.append(r)
    json.dump(idx, open(os.path.join(ROOT, "web", "data", "indice.json"), "w", encoding="utf-8"), ensure_ascii=False)
    print(f"índice enxuto -> web/data/indice.json")
    # um arquivo por UF em public/dados/uf/ (o cliente carrega só as UFs que o usuário escolheu)
    pub = os.path.join(ROOT, "web", "public", "dados", "uf"); os.makedirs(pub, exist_ok=True)
    for f in glob.glob(os.path.join(pub, "*.json")): os.remove(f)
    por_uf = {}
    for r in idx: por_uf.setdefault(r["uf"], []).append(r)
    for uf, lst in por_uf.items():
        json.dump(lst, open(os.path.join(pub, f"{uf}.json"), "w", encoding="utf-8"), ensure_ascii=False)
    print(f"{len(por_uf)} UFs -> web/public/dados/uf/")
    fontes_meta = {}
    for it in out: fontes_meta.setdefault(it["fonte"], 0)
    for it in out: fontes_meta[it["fonte"]] += 1
    json.dump({"gerado_em": now_iso(), "total": len(out), "fontes": stats,
               "por_uf": {uf: len(l) for uf, l in sorted(por_uf.items())},
               "por_fonte": fontes_meta},
              open(os.path.join(ROOT, "web", "data", "meta.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    if "-v" in sys.argv or "--stats" in sys.argv:
        print("\nmesclagens por par de fontes:")
        for par, n in merges.most_common(25): print(f"   {par[0]} + {par[1]}: {n}")
        print(f"   TOTAL {sum(merges.values())} mesclagens; exemplos: {exemplos}")
        print("\ncampos preenchidos a partir do texto:")
        for (fo, k), n in sorted(preenchidos.items()): print(f"   {fo:<18} {k:<20} {n}")
    print(f"suspeitos: {sum(1 for it in out if it.get('valor_suspeito'))}")
    print(f"mesclagens entre fontes: {sum(n for p, n in merges.items())}")
    print(f"TOTAL {len(out)} imóveis -> web/data/imoveis.json")

if __name__ == "__main__": main()
