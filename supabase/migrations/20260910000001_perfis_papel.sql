-- Lotwise · Segurança: o dono do perfil não pode promover a si mesmo a admin.
-- A policy antiga de update só checava o user_id, então um update direto na API do Supabase
-- poderia trocar papel para 'admin'. Agora o papel gravado precisa ser igual ao que já está lá:
-- mudança de papel só pelo servidor (service role), que ignora RLS.
-- A grant de coluna (só "nome") continua valendo; isto é a segunda tranca.

drop policy if exists "dono altera" on public.lotwise_perfis;
create policy "dono altera" on public.lotwise_perfis
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and papel = (select p.papel from public.lotwise_perfis p where p.user_id = (select auth.uid()))
  );
