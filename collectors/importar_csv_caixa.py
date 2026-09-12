"""Atualiza data/raw/caixa.json a partir de um CSV baixado à mão do portal da Caixa.

Serve quando o robô é bloqueado (o listaweb responde 302 para requisição sem navegador):
baixe "Lista de imóveis" no site e rode `python collectors/importar_csv_caixa.py <arquivo.csv>`.

O CSV geral cobre Leilão SFI, Licitação Aberta e Venda Online. Venda Direta não vem nele,
então esses itens continuam vindo da coleta anterior, intactos.
"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import caixa
from common import RAW, save_raw

# Modalidades que o CSV geral cobre: para elas, o arquivo é a verdade do dia.
COBERTAS = {"leilao_sfi", "licitacao_aberta", "venda_online"}


def main(arquivo):
    texto = open(arquivo, encoding="latin-1").read()
    linhas = caixa.parse_csv(texto)
    novos = [caixa.row_to_item(r) for r in linhas if r.get("UF", "").strip()]
    novos = [it for it in novos if it["id"] != "caixa:"]
    caixa._mesclar_anterior(novos)

    caminho = os.path.join(RAW, "caixa.json")
    try:
        antigos = json.load(open(caminho, encoding="utf-8"))
    except Exception:
        antigos = []

    ids_novos = {it["id"] for it in novos}
    # Venda Direta (e qualquer modalidade fora do CSV) segue como estava; o resto é substituído.
    preservados = [x for x in antigos if x.get("modalidade") not in COBERTAS and x["id"] not in ids_novos]
    final = novos + preservados

    mortos = sum(1 for x in antigos if x.get("modalidade") in COBERTAS and x["id"] not in ids_novos)
    inéditos = sum(1 for it in novos if it["id"] not in {x["id"] for x in antigos})
    print(f"[caixa] CSV: {len(novos)} imóveis | novos: {inéditos} | saíram da lista: {mortos} | preservados (venda direta etc.): {len(preservados)}")
    print(f"[caixa] total gravado: {len(final)} (antes: {len(antigos)})")
    save_raw("caixa", final)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("uso: python collectors/importar_csv_caixa.py <Lista_imoveis_geral.csv>"); sys.exit(1)
    main(sys.argv[1])
