-- A listagem padrão esconde vetado e valor a conferir, e ordena por deságio. Sem um índice que
-- já venha nessa ordem, o Brasil inteiro obrigava a ordenar 30 mil linhas a cada busca (5,8 s).
-- O recorte da data fica de fora do predicado porque muda todo dia.
create index if not exists lotwise_catalogo_lista_idx
  on public.lotwise_catalogo (desagio_pct desc)
  where valor_suspeito = false and direitos_fiduciante = false and fracao_ideal = false;

create index if not exists lotwise_catalogo_lista_uf_idx
  on public.lotwise_catalogo (uf, desagio_pct desc)
  where valor_suspeito = false and direitos_fiduciante = false and fracao_ideal = false;

create index if not exists lotwise_catalogo_lista_lance_idx
  on public.lotwise_catalogo (uf, lance_minimo)
  where valor_suspeito = false and direitos_fiduciante = false and fracao_ideal = false;

create index if not exists lotwise_catalogo_lista_data_idx
  on public.lotwise_catalogo (uf, data_leilao)
  where valor_suspeito = false and direitos_fiduciante = false and fracao_ideal = false;

create index if not exists lotwise_catalogo_cidade_idx on public.lotwise_catalogo (cidade);

-- Depois de uma carga inteira o planejador está às cegas sobre a distribuição dos dados.
analyze public.lotwise_catalogo;
