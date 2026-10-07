-- Lotwise · espelho do condomínio: apartamentos do mesmo prédio em leilão ao mesmo tempo.
-- O build (collectors/common.py predio_e_unidade) lê do endereço o prédio (UF + cidade + via + número,
-- em hash curto), o bloco/torre, a unidade e, quando os dígitos permitem, andar e final.
-- Tudo nulo quando não dá para ler com segurança: o lote só fica fora do espelho.

alter table public.lotwise_catalogo
  add column if not exists predio_id text,
  add column if not exists bloco text,
  add column if not exists unidade text,
  add column if not exists andar int,
  add column if not exists final text;

create index if not exists lotwise_catalogo_predio_idx
  on public.lotwise_catalogo (predio_id) where predio_id is not null;

-- Prédios com 2+ unidades no catálogo, para a descoberta. Só o servidor lê (chave de serviço),
-- igual à contagem por UF: security_invoker e sem grant para anon/authenticated.
create or replace view public.lotwise_catalogo_predios as
  select predio_id,
         min(uf) as uf,
         min(cidade) as cidade,
         min(bairro) as bairro,
         min(endereco) as endereco,
         count(*) as unidades,
         count(*) filter (where data_leilao is null or data_leilao >= current_date) as abertas,
         count(distinct coalesce(bloco, '')) as blocos,
         min(lance_minimo) as lance_min,
         max(lance_minimo) as lance_max,
         max(desagio_pct) filter (where valor_suspeito is not true) as desagio_max
    from public.lotwise_catalogo
   where predio_id is not null
   group by predio_id
  having count(*) >= 2;

alter view public.lotwise_catalogo_predios set (security_invoker = true);
revoke all on public.lotwise_catalogo_predios from anon;
revoke all on public.lotwise_catalogo_predios from authenticated;
grant select on public.lotwise_catalogo_predios to service_role;
