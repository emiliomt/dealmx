\set ON_ERROR_STOP on
do $$ declare n int; begin
  select count(*) into n from deals;
  assert n = 30, 'seed: 30 deals, hay ' || n;
  assert (select count(*) from deals where es_ejemplo and status = 'publicado' and titulo like '[EJEMPLO]%') = 30, 'todos ficticios/publicados/marcados';
  assert (select count(distinct segmento) from deals) = 7, 'los 7 segmentos presentes';
  assert (select count(distinct tipo_operacion) from deals) = 4, 'los 4 tipos de operación';
  assert (select count(distinct municipio_clave || estado_clave) from deals) = 7, 'los 7 municipios';
  assert (select count(*) from deals where lat_aprox is null) = 0, 'todas con coordenadas aproximadas';
  assert (select count(*) from deals where noi_anual > renta_mensual_actual * 12) = 0, 'NOI <= renta anual';
  assert (select count(*) from deals where cap_rate is not null and (cap_rate < 0.02 or cap_rate > 0.20)) = 0, 'cap rates plausibles';
  assert (select count(*) from deals where tipo_operacion = 'busca_socio_capital' and (monto_capital_buscado is null or participacion_ofrecida_pct is null)) = 0, 'socio: capital y participación';
  assert (select count(*) from deals d join inegi_municipios m on m.estado_clave = d.estado_clave and m.clave = d.municipio_clave
          where m.nombre in ('Monterrey','San Pedro Garza García','Apodaca','General Escobedo','Santa Catarina','Saltillo','Ramos Arizpe')) = 30, 'municipios correctos según catálogo';
  assert (select count(*) from deals where m2_ref is distinct from coalesce(m2_construccion, m2_terreno)) = 0, 'm2_ref = construcción o terreno';
  assert (select count(*) from deals where m2_ref is null) = 0, 'm2_ref presente';
end $$;
\echo 'SEED: OK'
