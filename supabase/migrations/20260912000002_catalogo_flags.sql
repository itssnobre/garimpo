-- Flags calculadas pela coleta: ausência significa "não detectado", ou seja, falso.
-- Enquanto eram nulas, um filtro comum como "esconder valor a conferir" não devolvia nada,
-- porque em SQL nulo não é igual a falso.
update public.lotwise_catalogo set valor_suspeito = false where valor_suspeito is null;
update public.lotwise_catalogo set debitos_teto10 = false where debitos_teto10 is null;
update public.lotwise_catalogo set dominio_util = false where dominio_util is null;
update public.lotwise_catalogo set massa_falida = false where massa_falida is null;
update public.lotwise_catalogo set direitos_aquisitivos = false where direitos_aquisitivos is null;
update public.lotwise_catalogo set onus_averbado = false where onus_averbado is null;

alter table public.lotwise_catalogo
  alter column valor_suspeito set default false,
  alter column valor_suspeito set not null,
  alter column debitos_teto10 set default false,
  alter column debitos_teto10 set not null,
  alter column dominio_util set default false,
  alter column dominio_util set not null,
  alter column massa_falida set default false,
  alter column massa_falida set not null,
  alter column direitos_aquisitivos set default false,
  alter column direitos_aquisitivos set not null,
  alter column onus_averbado set default false,
  alter column onus_averbado set not null;
