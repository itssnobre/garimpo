-- Lotwise · Acompanhar: lotes que o usuário quer ver atualizados em tempo real (estado da última verificação na fonte).
create table if not exists public.lotwise_acompanhar (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  lote_id text not null,
  estado jsonb,
  verificado_em timestamptz,
  criado_em timestamptz not null default now(),
  primary key (user_id, lote_id)
);
alter table public.lotwise_acompanhar enable row level security;
drop policy if exists "dono le" on public.lotwise_acompanhar;
drop policy if exists "dono insere" on public.lotwise_acompanhar;
drop policy if exists "dono altera" on public.lotwise_acompanhar;
drop policy if exists "dono apaga" on public.lotwise_acompanhar;
create policy "dono le" on public.lotwise_acompanhar for select to authenticated using ((select auth.uid()) = user_id);
create policy "dono insere" on public.lotwise_acompanhar for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "dono altera" on public.lotwise_acompanhar for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "dono apaga" on public.lotwise_acompanhar for delete to authenticated using ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.lotwise_acompanhar to authenticated;
revoke all on public.lotwise_acompanhar from anon;
