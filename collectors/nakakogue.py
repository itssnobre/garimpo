"""Coletor Nakakogue Leilões (nakakogueleiloes.com.br), leiloeiro de Curitiba/PR (judicial,
trabalhista, Itaipu e órgãos públicos). Cobertura: onde o leiloeiro atua (majoritariamente PR).

Método: HTML + bs4 (site softGT, PHP + jQuery).
  Listagem: https://nakakogueleiloes.com.br/lotes/consulta/1   (categoria 1 = Imóveis; TODOS os
            lotes numa única página, paginação é client-side/jPages). Cada <li> traz nº do lote,
            título (descrição curta com endereço), categoria, Valor Avaliado, Valor Mínimo, edital
            (nome do juízo + PDF), situação e lance atual; o link "VER LOTE" dá
            detalhe-lote/<idLeilao>/<nLote>.
  Home:     https://nakakogueleiloes.com.br/  -> cards dos leilões (lotes/<idLeilao>): título
            ("2º Leilão - 2ª Vara ... de Londrina"), data/hora, edital.
  Detalhe:  a página detalhe-lote/ é preenchida via JS/sessão (proximo_lote.php etc.) e, sem login,
            vem vazia; por isso NÃO é usada. Nº do processo, descrição longa e fotos não estão
            disponíveis sem JS.

UF/cidade: o site não estrutura a localização. Regras, nesta ordem:
  1) "Cidade/UF" ou "Cidade - UF" no título do lote;
  2) comarca no nome do edital/leilão ("... de Londrina") -> cidade; UF = PR se a cidade estiver
     na lista de comarcas paranaenses (COMARCAS_PR); "ITAIPU" -> Foz do Iguaçu/PR.
  Lote sem UF resolvida é descartado (logado em stderr), nunca inventado.
Só entram lotes com situação "À Venda"/"Aberto"; Suspenso/Vendido são descartados.
"""
import re, sys, os, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bs4 import BeautifulSoup
from common import session, money, city, tipo, desagio, flags, now_iso, save_raw, strip_accents

FONTE = "nakakogue"
BASE = "https://www.nakakogueleiloes.com.br"
MAX = int(os.environ.get("GARIMPO_MAX", "0") or 0)
UFS = "AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO"
COMARCAS_PR = {strip_accents(x.strip()).lower() for x in """
Curitiba, Londrina, Maringá, Ponta Grossa, Cascavel, São José dos Pinhais, Foz do Iguaçu, Colombo, Guarapuava,
Paranaguá, Araucária, Toledo, Apucarana, Pinhais, Campo Largo, Arapongas, Almirante Tamandaré, Umuarama, Piraquara,
Cambé, Fazenda Rio Grande, Paranavaí, Francisco Beltrão, Pato Branco, Cianorte, Telêmaco Borba, Castro, Rolândia,
Irati, União da Vitória, Ibiporã, Sarandi, Campo Mourão, Lapa, Bandeirantes, Tomazina, Ortigueira, Cornélio Procópio,
Jacarezinho, Santo Antônio da Platina, Prudentópolis, Palmas, Dois Vizinhos, Marechal Cândido Rondon, Medianeira,
Assis Chateaubriand, Rio Negro, Matinhos, Guaratuba, Pontal do Paraná, Ivaiporã, Wenceslau Braz, Ibaiti, Jaguariaíva,
Palmeira, Imbituva, Pitanga, Laranjeiras do Sul, Quedas do Iguaçu, Goioerê, Ubiratã, Astorga, Mandaguari,
Jandaia do Sul, Nova Esperança, Loanda, Cidade Gaúcha, Santa Helena, Guaíra, Palotina, Cruzeiro do Oeste, Altônia,
Colorado, Porecatu, Sertanópolis, Bela Vista do Paraíso, Cambará, Andirá, Siqueira Campos, Reserva, Tibagi, Ipiranga,
Rebouças, São Mateus do Sul, Mallet, Rio Branco do Sul, Cerro Azul, Morretes, Antonina, Campina Grande do Sul,
Quatro Barras, Bocaiúva do Sul, Contenda, Balsa Nova, Mandirituba, Tijucas do Sul, Agudos do Sul, Piên,
Campo do Tenente, Quitandinha, Arapoti, Pinhão, Candói, Chopinzinho, Coronel Vivida, Clevelândia, Mangueirinha,
Capanema, Realeza, Santo Antônio do Sudoeste, Ampére, Pérola, Terra Roxa, Nova Aurora, Corbélia, Cafelândia,
Capitão Leônidas Marques, Santa Terezinha de Itaipu, São Miguel do Iguaçu, Matelândia, Céu Azul, Peabiru,
Engenheiro Beltrão, Terra Boa, Marialva, Paiçandu, Floresta, Alto Paraná, Nova Londrina, Terra Rica, Paranacity,
Rondon, Icaraíma, Iporã, Xambrê, Cambira, Faxinal, Jardim Alegre, Manoel Ribas, Grandes Rios, São João do Ivaí,
Marilândia do Sul, Califórnia, Tamarana, Primeiro de Maio, Alvorada do Sul, Florestópolis, Centenário do Sul,
Guaraci, Jaguapitã, Assaí, Uraí, Ribeirão do Pinhal, Carlópolis, Joaquim Távora, Curiúva, Sapopema, Ventania,
Piraí do Sul, Sengés, Carambeí, Ivaí, Teixeira Soares, Fernandes Pinheiro, Guamiranga, Inácio Martins, Cruz Machado,
Bituruna, General Carneiro, Paula Freitas, Paulo Frontin, Porto Vitória, São João do Triunfo, Antônio Olinto,
Adrianópolis, Doutor Ulysses, Tunas do Paraná, Itaperuçu, Campo Magro
""".replace("\n", " ").split(",") if x.strip()}
S = session()


def _get(url, tries=3):
    for i in range(tries):
        try:
            r = S.get(url, timeout=40)
            if r.status_code == 200:
                r.encoding = "utf-8"
                return r.text
            print(f"[{FONTE}] HTTP {r.status_code} {url}", file=sys.stderr)
        except Exception as e:
            print(f"[{FONTE}] erro {e} {url}", file=sys.stderr)
        time.sleep(1.5 * (i + 1))
    return None


def _date(t):
    m = re.search(r"(\d{2})/(\d{2})/(\d{4})", t or "")
    return f"{m.group(3)}-{m.group(2)}-{m.group(1)}" if m else None


def _leiloes():
    """{idLeilao: {titulo, data, edital}} a partir dos cards da home."""
    out = {}
    h = _get(BASE + "/")
    if not h: return out
    sp = BeautifulSoup(h, "html.parser")
    for li in sp.select("ul.leiloes li"):
        a = li.select_one('a[href*="lotes/"]')
        if not a: continue
        m = re.search(r"lotes/(\d+)", a["href"])
        if not m: continue
        tit = li.select_one(".titulo-leilao")
        ed = li.select_one("a.btn-edital")
        out[m.group(1)] = {
            "titulo": tit.get_text(" ", strip=True) if tit else "",
            "data": _date(li.get_text(" ", strip=True)),
            "edital": (BASE + "/" + ed["href"].strip()) if ed and ed.get("href") else None,
        }
    return out


def _loc(titulo, edital_nome, leilao_titulo):
    """(cidade, uf) — ver regras no docstring."""
    m = re.search(r"([A-Za-zÀ-ú][A-Za-zÀ-ú' ,]{2,60}?)\s*(?:/|\s-\s)\s*(" + UFS + r")(?![-\w])", titulo)
    if m:
        seg = m.group(1).split(",")[-1].strip()
        # fica só com a sequência final de palavras capitalizadas ("Terreno situado Sao Leopoldo" -> "Sao Leopoldo")
        words, run = seg.split(), []
        for w in reversed(words):
            if w[:1].isupper() or w.lower() in ("de", "do", "da", "dos", "das"): run.insert(0, w)
            else: break
        while run and run[0].lower() in ("de", "do", "da", "dos", "das"): run.pop(0)
        cid = " ".join(run) or seg
        if len(re.sub(r"[^A-Za-zÀ-ú]", "", cid)) >= 3:
            return cid, m.group(2)
    for src in (edital_nome, leilao_titulo):
        if not src: continue
        if "itaipu" in src.lower():
            return "Foz do Iguaçu", "PR"
        for m in re.finditer(r"\b[Dd][Ee]\s+", src.strip()):
            cid = src.strip()[m.end():].strip(" .-")
            if strip_accents(cid).lower() in COMARCAS_PR:
                return cid, "PR"
    return None, None


def collect():
    leiloes = _leiloes()
    print(f"[{FONTE}] {len(leiloes)} leilões na home", file=sys.stderr)
    h = _get(BASE + "/lotes/consulta/1")
    if not h:
        return []
    sp = BeautifulSoup(h, "html.parser")
    lis = sp.select("ul.lotes li")
    print(f"[{FONTE}] {len(lis)} lotes na categoria imóveis", file=sys.stderr)
    if MAX: lis = lis[:MAX]
    items, seen, sem_uf = [], set(), 0
    for li in lis:
        try:
            a = li.select_one('a[href*="detalhe-lote"]')
            if not a: continue
            m = re.search(r"detalhe-lote/(\d+)/(\w+)", a["href"])
            if not m: continue
            lid, nlote = m.group(1), m.group(2)
            spans = {}
            for s_ in li.select("span"):
                sm = s_.select_one("small")
                if sm:
                    k = strip_accents(sm.get_text(" ", strip=True).rstrip(":").lower())
                    spans[k] = s_.get_text(" ", strip=True).split(":", 1)[-1].strip()
            sit = spans.get("situacao", "").lower()
            if sit and not any(k in sit for k in ("venda", "aberto")):
                continue
            tit_el = li.select_one(".titulo-lote")
            titulo = re.sub(r"^\s*\d+\s*-\s*", "", tit_el.get_text(" ", strip=True)) if tit_el else ""
            titulo = re.sub(r"\s+", " ", titulo).strip()
            aval = money(spans.get("valor avaliado"))
            minimo = money(spans.get("valor minimo"))
            atual_el = li.select_one(".titulo-vlr-lance")
            atual = money(atual_el.get_text()) if atual_el else None
            lance = max([x for x in (minimo, atual) if x] or [0]) or None
            if not lance: continue
            if not aval or aval < lance: aval = aval if aval and aval >= lance else lance
            ed_a = [s_ for s_ in li.select("span") if s_.select_one("small") and "edital" in s_.select_one("small").get_text().lower()]
            edital_nome = spans.get("edital", "")
            edital_url = None
            if ed_a and ed_a[0].select_one("a[href]"):
                href = ed_a[0].select_one("a[href]")["href"].strip()
                edital_url = href if href.startswith("http") else BASE + "/" + href.lstrip("/")
            lei = leiloes.get(lid, {})
            cid, uf = _loc(titulo, edital_nome, lei.get("titulo", ""))
            if not uf:
                sem_uf += 1
                print(f"[{FONTE}] sem UF, descartado: {lid}/{nlote} '{titulo[:60]}' edital='{edital_nome}'", file=sys.stderr)
                continue
            src = (edital_nome + " " + lei.get("titulo", "")).lower()
            if re.search(r"vara|ju[ií]zo|comarca|hasta|execu", src): modalidade = "judicial"
            elif "itaipu" in src or "prefeitura" in src: modalidade = "licitacao_aberta"
            else: modalidade = "extrajudicial"
            praca = None
            mp = re.search(r"(\d)\s*[ºo°]\s*leil", lei.get("titulo", "").lower())
            if mp: praca = int(mp.group(1))
            low = strip_accents(titulo.lower())
            if re.search(r"cotas? sociais|quotas? sociais|direitos? de credito|\bveiculo|\bcaminhao\b|\bmoto\b", low):
                continue  # não é imóvel
            tt = tipo(titulo)
            if tt == "outro":
                if re.search(r"\bdatas? (de )?terras?|\bdatas? (sob )?n|\bquadra\b|\barea|\bquinhao|\bgleba|\bimovel (rural|industrial)", low): tt = "terreno"
                if "rural" in low or "chacara" in low or "sitio" in low: tt = "rural"
                if re.search(r"\bapto\b|apartamento|cobertura", low): tt = "apartamento"
                if re.search(r"\bvaga|garagem", low): tt = "outro"
            fl = flags(titulo)
            item = {
                "id": f"{FONTE}:{lid}-{nlote}",
                "fonte": FONTE,
                "url": f"{BASE}/detalhe-lote/{lid}/{nlote}",
                "tipo": tt,
                "titulo": titulo[:200],
                "cidade": city(cid or ""),
                "uf": uf,
                "avaliacao": aval,
                "lance_minimo": lance,
                "desagio_pct": desagio(aval, lance),
                "modalidade": modalidade,
                "praca": praca,
                "data_leilao": lei.get("data"),
                "data_fim": lei.get("data"),
                "vara": edital_nome if modalidade == "judicial" else None,
                "leiloeiro": "Nakakogue Leilões",
                "direitos_fiduciante": fl["direitos_fiduciante"],
                "fracao_ideal": fl["fracao_ideal"],
                "edital_url": edital_url or lei.get("edital"),
                "descricao": titulo,
                "coletado_em": now_iso(),
            }
            item = {k: v for k, v in item.items() if v is not None or k in ("praca", "data_leilao")}
            if item["id"] in seen: continue
            seen.add(item["id"]); items.append(item)
        except Exception as e:
            print(f"[{FONTE}] falha em lote: {e}", file=sys.stderr)
    print(f"[{FONTE}] {len(items)} itens; {sem_uf} descartados sem UF", file=sys.stderr)
    return items


if __name__ == "__main__":
    save_raw(FONTE, collect())
