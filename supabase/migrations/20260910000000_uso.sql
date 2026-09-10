-- Lotwise · Limite de uso: contador por chave e janela de tempo, usado pelas rotas caras
-- (/api/matricula, /api/sage, /api/acompanhar/verificar). Só o servidor (service role) escreve e lê.
-- Nenhum papel do navegador enxerga a tabela: sem policy para anon/authenticated, tudo revogado.

create table if not exists public.lotwise_uso (
  chave text not null,
  janela_inicio timestamptz not null,
  contagem int not null default 0,
  atualizado_em timestamptz not null default now(),
  primary key (chave, janela_inicio)
);

create index if not exists lotwise_uso_janela on public.lotwise_uso (janela_inicio);

alter table public.lotwise_uso enable row level security;
-- Sem policies de propósito: com RLS ligada e nenhuma policy, anon e authenticated não leem nem escrevem.
-- A chave de serviço ignora RLS.

revoke all on public.lotwise_uso from anon;
revoke all on public.lotwise_uso from authenticated;

drop trigger if exists toca_atualizado on public.lotwise_uso;
create trigger toca_atualizado before update on public.lotwise_uso for each row execute function public.lotwise_toca_atualizado();
