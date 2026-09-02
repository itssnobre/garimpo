-- Lotwise · Fase 4b (admin): perfil por usuário com papel (admin | cliente).
-- Sem trigger em auth.users de propósito: o projeto Supabase é compartilhado com outros apps.
-- O perfil é criado pelo próprio app na primeira entrada (insert com RLS) ou pelo admin (service role).

create table if not exists public.lotwise_perfis (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  nome text not null default '',
  papel text not null default 'cliente' check (papel in ('admin', 'cliente')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

alter table public.lotwise_perfis enable row level security;
drop policy if exists "dono le" on public.lotwise_perfis;
drop policy if exists "dono insere" on public.lotwise_perfis;
drop policy if exists "dono altera" on public.lotwise_perfis;
create policy "dono le" on public.lotwise_perfis for select to authenticated using ((select auth.uid()) = user_id);
-- Só nasce como cliente: papel admin é dado pelo servidor (service role).
create policy "dono insere" on public.lotwise_perfis for insert to authenticated with check ((select auth.uid()) = user_id and papel = 'cliente');
create policy "dono altera" on public.lotwise_perfis for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke all on public.lotwise_perfis from anon;
revoke all on public.lotwise_perfis from authenticated;
grant select on public.lotwise_perfis to authenticated;
grant insert (user_id, nome, papel) on public.lotwise_perfis to authenticated;
-- Usuário só edita o próprio nome; papel é coluna do servidor.
grant update (nome) on public.lotwise_perfis to authenticated;

drop trigger if exists toca_atualizado on public.lotwise_perfis;
create trigger toca_atualizado before update on public.lotwise_perfis for each row execute function public.lotwise_toca_atualizado();
