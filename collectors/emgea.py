"""Coletor Emgea (Empresa Gestora de Ativos, governo federal) via www.emgeaimoveis.com.br, Brasil inteiro.

emgea.gov.br só aponta para emgeaimoveis.com.br, white-label operado pela Resale (mesma SPA e mesma API):
  Base:     https://yfvun6xbh1.execute-api.us-east-2.amazonaws.com/prod/emgea  (X-API-KEY do bundle + Origin)
  Listagem: GET /property?order=relevante&page=N  (20 por página; `offset`/`limit` dão 500 "division by zero")
  Detalhe:  GET /property/<uuid|IDRxxxxx>
Reaproveita o parser de resale.py (mesmo schema de resposta). Vendas: "Venda direta" (proposta) e "Leilão".
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import save_raw
import resale

CFG = {
    "fonte": "emgea",
    "base": "https://yfvun6xbh1.execute-api.us-east-2.amazonaws.com/prod/emgea",
    "key": "rTV9MjnNrg86r6cFRU7O71QWsmUmJ2F83KcglBTy",
    "origin": "https://www.emgeaimoveis.com.br",
    "site": "https://www.emgeaimoveis.com.br/imovel/",
}

def collect():
    return resale.collect_from(CFG)

if __name__ == "__main__":
    save_raw(CFG["fonte"], collect())
