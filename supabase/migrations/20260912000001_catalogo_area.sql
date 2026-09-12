-- Área que a busca usa: privativa quando existe, senão a do terreno. É a mesma regra do motor
-- (lib/motor.ts, areaDe). Como coluna gerada, o filtro de área vira comparação indexada.
alter table public.lotwise_catalogo
  add column if not exists area_util numeric
  generated always as (coalesce(nullif(area_privativa_m2, 0), area_terreno_m2, 0)) stored;

create index if not exists lotwise_catalogo_area_idx on public.lotwise_catalogo (area_util);
-- Listagem com foto é um filtro comum e a coluna é quase sempre nula.
create index if not exists lotwise_catalogo_foto_idx on public.lotwise_catalogo (foto) where foto is not null;
