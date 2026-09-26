-- Lotwise · Auditoria de segurança 26/09/2026. NÃO aplicada automaticamente: revisar e aplicar à mão.
--
-- 1) Limite de uso atômico. O caminho antigo (ler contagem, depois gravar contagem + 1) deixa
--    requisições simultâneas passarem juntas pelo teto. Esta função soma e devolve numa instrução só.
--    Só o servidor (service role) executa; anon e authenticated não enxergam.
create or replace function public.lotwise_uso_incrementar(p_chave text, p_janela timestamptz)
returns int
language sql
security invoker
set search_path = ''
as $$
  insert into public.lotwise_uso as u (chave, janela_inicio, contagem)
  values (p_chave, p_janela, 1)
  on conflict (chave, janela_inicio) do update set contagem = u.contagem + 1
  returning u.contagem;
$$;

revoke all on function public.lotwise_uso_incrementar(text, timestamptz) from public;
revoke all on function public.lotwise_uso_incrementar(text, timestamptz) from anon;
revoke all on function public.lotwise_uso_incrementar(text, timestamptz) from authenticated;
grant execute on function public.lotwise_uso_incrementar(text, timestamptz) to service_role;

-- 2) A view de contagem por estado roda com o dono (postgres) e ignora a RLS do catálogo.
--    Os privilégios padrão do Supabase dão select em objetos novos do schema public para anon e
--    authenticated, então a view fica legível pelo PostgREST público com a chave publicável.
--    Quem usa a view é só o servidor com a chave de serviço (lib/catalogo.ts, contagemPorUF).
alter view public.lotwise_catalogo_por_uf set (security_invoker = true);
revoke all on public.lotwise_catalogo_por_uf from anon;
revoke all on public.lotwise_catalogo_por_uf from authenticated;
grant select on public.lotwise_catalogo_por_uf to service_role;
