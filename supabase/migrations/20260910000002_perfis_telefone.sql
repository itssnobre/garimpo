-- Lotwise: celular no perfil (captação de leads no cadastro por e-mail).
alter table public.lotwise_perfis add column if not exists telefone text not null default '';
grant insert (user_id, nome, papel, telefone) on public.lotwise_perfis to authenticated;
grant update (nome, telefone) on public.lotwise_perfis to authenticated;
