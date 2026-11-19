-- DealMX · verificación POSTERIOR a las migraciones (SOLO LECTURA: únicamente SELECT).
-- Pégalo en el SQL Editor de Supabase (o `psql -f`). Devuelve una fila por comprobación y una fila final de resumen:
-- todas deben decir OK. Si alguna dice FALLA, la columna "comprobacion" indica qué revisar.
with c(orden, comprobacion, esperado, actual) as (
  -- Datos de catálogo
  select 1,  'inegi_estados (filas)',                  '32', (select count(*)::text from public.inegi_estados)
  union all select 2,  'inegi_municipios (filas)',     '89', (select count(*)::text from public.inegi_municipios)
  union all select 3,  'nda_templates activa',          '1', (select count(*)::text from public.nda_templates where activo)

  -- Esquema y RLS
  union all select 4,  'tablas esperadas presentes (de 15)', '15', (select count(*)::text from pg_tables where schemaname = 'public' and tablename in (
      'inegi_estados','inegi_municipios','profiles','deals','deal_private','deal_photos','deal_documents','ndas','nda_templates',
      'saved_searches','favorites','pipeline_items','messages','deal_views','admin_audit'))
  union all select 5,  'tablas de public SIN RLS',       '0', (select count(*)::text from pg_tables where schemaname = 'public' and not rowsecurity)

  -- Storage y Realtime
  union all select 6,  'buckets (data-room privado, deal-photos público)', 'data-room:false,deal-photos:true',
      coalesce((select string_agg(id || ':' || public::text, ',' order by id) from storage.buckets where id in ('deal-photos', 'data-room')), 'ausentes')
  union all select 7,  'políticas de Storage del proyecto (de 5)', '5', (select count(*)::text from pg_policies where schemaname = 'storage' and tablename = 'objects'
      and policyname in ('fotos escritura dueno','fotos borrado dueno','dataroom lectura','dataroom escritura','dataroom borrado'))
  union all select 8,  'trigger on_auth_user_created en auth.users', '1', (select count(*)::text from pg_trigger t
      join pg_class k on k.oid = t.tgrelid join pg_namespace n on n.oid = k.relnamespace
      where n.nspname = 'auth' and k.relname = 'users' and t.tgname = 'on_auth_user_created' and not t.tgisinternal)
  union all select 9,  'messages en la publicación supabase_realtime', '1', (select count(*)::text from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages')

  -- Permisos: las funciones privilegiadas existen y el rol anónimo NO puede ejecutarlas
  union all select 10, 'funciones privilegiadas presentes (de 9)', '9', (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname in ('moderar_deal','verificar_usuario','reabrir_nda','admin_resumen','solicitantes_nda','vistas_deal',
        'deals_vendedor_stats','solicitudes_pendientes_vendedor','hilos_vendedor'))
  union all select 11, 'funciones privilegiadas ejecutables por anon', '0', (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname in ('moderar_deal','verificar_usuario','reabrir_nda','admin_resumen','solicitantes_nda','vistas_deal',
        'deals_vendedor_stats','solicitudes_pendientes_vendedor','hilos_vendedor') and has_function_privilege('anon', p.oid, 'execute'))
  union all select 12, 'admin_audit con INSERT para anon/authenticated', 'false', coalesce((select (has_table_privilege('anon', k.oid, 'insert')
      or has_table_privilege('authenticated', k.oid, 'insert'))::text from pg_class k join pg_namespace n on n.oid = k.relnamespace
      where n.nspname = 'public' and k.relname = 'admin_audit'), 'ausente')

  -- Privacidad: ningún campo privado vive en la tabla pública
  union all select 13, 'columnas privadas dentro de deals', '0', (select count(*)::text from information_schema.columns
      where table_schema = 'public' and table_name = 'deals' and column_name in ('direccion_exacta','descripcion_completa','lat','lng'))
),
r as (select orden, comprobacion, esperado, actual, (esperado = actual) as ok from c)
select orden, comprobacion, esperado, actual, case when ok then 'OK' else 'FALLA' end as resultado from r
union all
select 999, '>>> RESUMEN', 'todo OK',
       case when bool_and(ok) then 'todo OK' else count(*) filter (where not ok) || ' falla(s)' end,
       case when bool_and(ok) then 'OK' else 'FALLA' end
from r
order by orden;
