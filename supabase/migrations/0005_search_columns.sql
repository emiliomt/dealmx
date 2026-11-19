-- DealMX · 0005 · columnas de apoyo para búsqueda
-- m2_ref: superficie de referencia para el filtro de m² (construcción; si no hay, terreno).
alter table deals add column m2_ref numeric(14,2) generated always as (coalesce(m2_construccion, m2_terreno)) stored;
create index deals_m2_ref_idx on deals (m2_ref);
create index deals_ocupacion_idx on deals (ocupacion_pct);
