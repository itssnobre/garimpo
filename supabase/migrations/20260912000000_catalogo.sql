-- Lotwise · catálogo de lotes no banco (saindo dos JSON versionados).
-- Os campos que a busca filtra, ordena ou mostra no card viram coluna; o resto pesado
-- (descrição, fotos, links de edital e matrícula) fica em `detalhe`, que o Postgres guarda
-- fora da linha e só lê quando a consulta pede, então a listagem não paga por ele.
--
-- Sem acesso para anon/authenticated de propósito: quem lê é o servidor do Next com a chave
-- de serviço, que é onde já vivem o limite do visitante e o rate limit. Assim o catálogo
-- inteiro não fica exposto no PostgREST.

create table if not exists public.lotwise_catalogo (
  id text primary key,
  fonte text not null,
  url text not null,
  tipo text not null,
  titulo text not null,
  endereco text,
  bairro text,
  cidade text not null,
  uf text not null,
  cep text,
  area_privativa_m2 numeric,
  area_terreno_m2 numeric,
  quartos int,
  vagas int,
  avaliacao numeric not null,
  lance_minimo numeric not null,
  desagio_pct numeric not null default 0,
  modalidade text not null,
  praca int,
  data_leilao date,
  data_fim date,
  ocupado boolean,
  aceita_financiamento boolean,
  aceita_fgts boolean,
  debitos_por_conta_comprador boolean,
  direitos_fiduciante boolean not null default false,
  fracao_ideal boolean not null default false,
  dominio_util boolean,
  massa_falida boolean,
  direitos_aquisitivos boolean,
  onus_averbado boolean,
  debitos_teto10 boolean,
  valor_suspeito boolean,
  avaliacao_outra_fonte numeric,
  matricula text,
  leiloeiro text,
  foto text,
  -- Texto já sem acento e em minúsculas, montado pelo carregador: cidade, bairro, endereço,
  -- título e matrícula. É o que a busca por texto varre.
  busca text not null default '',
  detalhe jsonb not null default '{}'::jsonb,
  coletado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Listagem: quase toda consulta começa filtrando estado e joga fora o que não tem leilão aberto.
create index if not exists lotwise_catalogo_uf_idx on public.lotwise_catalogo (uf);
create index if not exists lotwise_catalogo_uf_desagio_idx on public.lotwise_catalogo (uf, desagio_pct desc);
create index if not exists lotwise_catalogo_data_idx on public.lotwise_catalogo (data_leilao);
create index if not exists lotwise_catalogo_fonte_idx on public.lotwise_catalogo (fonte);
create index if not exists lotwise_catalogo_valor_idx on public.lotwise_catalogo (lance_minimo);

-- Busca por cidade, bairro, rua ou matrícula: trigram aguenta o "contém" no meio da palavra.
create extension if not exists pg_trgm;
create index if not exists lotwise_catalogo_busca_idx on public.lotwise_catalogo using gin (busca gin_trgm_ops);

alter table public.lotwise_catalogo enable row level security;
revoke all on public.lotwise_catalogo from anon;
revoke all on public.lotwise_catalogo from authenticated;

drop trigger if exists toca_atualizado on public.lotwise_catalogo;
create trigger toca_atualizado before update on public.lotwise_catalogo
  for each row execute function public.lotwise_toca_atualizado();

-- Contagem por estado para os painéis, sem varrer a tabela na mão a cada visita.
create or replace view public.lotwise_catalogo_por_uf as
  select uf,
         count(*) as total,
         count(*) filter (where data_leilao is null or data_leilao >= current_date) as abertos
    from public.lotwise_catalogo
   group by uf;
