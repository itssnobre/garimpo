-- Lotwise · Fase 4 (conta): dados do usuário que antes viviam só no localStorage.
-- Rodar no SQL Editor do projeto "lotwise" (ou `supabase db push`). Todas as tabelas: RLS por dono, user_id preenchido pelo servidor.

create table if not exists public.lotwise_favoritos (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  lote_id text not null,
  criado_em timestamptz not null default now(),
  primary key (user_id, lote_id)
);

create table if not exists public.lotwise_padroes (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  dados jsonb not null,
  ativo boolean not null default false,
  atualizado_em timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.lotwise_pipeline (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  lote_id text not null,
  dados jsonb not null,
  atualizado_em timestamptz not null default now(),
  primary key (user_id, lote_id)
);

-- Custos editados, checklist e análise de IA de cada lote aberto.
create table if not exists public.lotwise_lotes (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  lote_id text not null,
  dados jsonb not null,
  atualizado_em timestamptz not null default now(),
  primary key (user_id, lote_id)
);

create or replace function public.lotwise_toca_atualizado() returns trigger language plpgsql security invoker as $$
begin new.atualizado_em := now(); return new; end $$;

do $$ declare t text; begin
  foreach t in array array['lotwise_favoritos', 'lotwise_padroes', 'lotwise_pipeline', 'lotwise_lotes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "dono le" on public.%I', t);
    execute format('drop policy if exists "dono insere" on public.%I', t);
    execute format('drop policy if exists "dono altera" on public.%I', t);
    execute format('drop policy if exists "dono apaga" on public.%I', t);
    execute format('create policy "dono le" on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t);
    execute format('create policy "dono insere" on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "dono altera" on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "dono apaga" on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('revoke all on public.%I from anon', t);
    if t <> 'lotwise_favoritos' then
      execute format('drop trigger if exists toca_atualizado on public.%I', t);
      execute format('create trigger toca_atualizado before update on public.%I for each row execute function public.lotwise_toca_atualizado()', t);
    end if;
  end loop;
end $$;
