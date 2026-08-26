# Schema normalizado de imóvel (data/imoveis.json)

Cada coletor em `collectors/<fonte>.py` expõe `collect() -> list[dict]` e, quando rodado direto, grava `data/raw/<fonte>.json`. `collectors/build.py` junta tudo, deduplica e grava `data/imoveis.json`.

Campos (todos os strings em UTF-8; dinheiro em R$ float; datas ISO `YYYY-MM-DD`):

| campo | tipo | obrig. | descrição |
|---|---|---|---|
| id | str | sim | `<fonte>:<id na fonte>` |
| fonte | str | sim | `caixa`, `zuk`, `megaleiloes`, `superbid`, `sodresantoro`, `leilaoimovel`, `frazao`, `biasi`, `lancejudicial`, ... |
| url | str | sim | link do lote na fonte |
| tipo | str | sim | `apartamento`, `casa`, `terreno`, `comercial`, `rural`, `outro` |
| titulo | str | sim | título curto |
| endereco | str | não | logradouro + número |
| bairro | str | não | |
| cidade | str | sim | nome da cidade (sem UF) |
| uf | str | sim | `SP` |
| cep | str | não | |
| area_privativa_m2 | float | não | |
| area_terreno_m2 | float | não | |
| quartos | int | não | |
| vagas | int | não | |
| avaliacao | float | sim | valor de avaliação / mercado informado pela fonte |
| lance_minimo | float | sim | lance mínimo atual (ou valor de venda direto) |
| desagio_pct | float | sim | `1 - lance_minimo/avaliacao` (0..1) |
| modalidade | str | sim | `leilao_sfi`, `licitacao_aberta`, `venda_online`, `venda_direta`, `judicial`, `extrajudicial`, `outro` |
| praca | int | não | 1 ou 2 |
| data_leilao | str | não | data do leilão/praça relevante (ISO) |
| data_fim | str | não | fim da praça / prazo de proposta |
| ocupado | bool/null | não | `true` ocupado, `false` desocupado, `null` desconhecido |
| aceita_financiamento | bool/null | não | |
| aceita_fgts | bool/null | não | |
| debitos_regra | str | não | texto da regra de débitos (condomínio/IPTU) da fonte |
| debitos_por_conta_comprador | bool/null | não | |
| direitos_fiduciante | bool | sim | `true` se vende "direitos de devedor fiduciante" (VETO) |
| fracao_ideal | bool | sim | `true` se vende fração ideal (VETO) |
| matricula | str | não | número da matrícula |
| cartorio | str | não | |
| edital_url | str | não | |
| matricula_url | str | não | |
| fotos | list[str] | não | URLs |
| descricao | str | não | texto livre da fonte |
| coletado_em | str | sim | ISO datetime |

Regras: cidade sempre normalizada (Title Case, sem acento errado); nunca inventar campo; quando a fonte não informa, omitir ou `null`.
