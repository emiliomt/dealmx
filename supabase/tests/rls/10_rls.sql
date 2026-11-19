-- Pruebas de RLS. Cualquier aserción fallida lanza excepción y el runner sale con error.
\set ON_ERROR_STOP on

-- (los privilegios por defecto de Supabase se emulan en 00_shim.sql, antes de crear las tablas)

-- Datos base (como superusuario/postgres: no aplica RLS)
insert into auth.users (id, raw_user_meta_data) values
 ('00000000-0000-0000-0000-0000000000a1', '{"rol":"vendedor","nombre":"Vendedor A"}'),
 ('00000000-0000-0000-0000-0000000000a2', '{"rol":"vendedor","nombre":"Vendedor B"}'),
 ('00000000-0000-0000-0000-0000000000b1', '{"rol":"inversionista","nombre":"Inv Con NDA"}'),
 ('00000000-0000-0000-0000-0000000000b2', '{"rol":"inversionista","nombre":"Inv Sin NDA"}'),
 ('00000000-0000-0000-0000-0000000000c1', '{"rol":"admin","nombre":"Intento admin"}');
-- handle_new_user NO debe crear admins desde metadata:
do $$ begin
  assert (select rol from profiles where id='00000000-0000-0000-0000-0000000000c1') = 'inversionista',
    'metadata rol=admin no debe otorgar admin';
end $$;
update profiles set rol='admin' where id='00000000-0000-0000-0000-0000000000c1'; -- superusuario sí puede

insert into deals (id, seller_id, titulo, tipo_operacion, segmento, estado_clave, municipio_clave, precio, noi_anual, m2_construccion, status)
values
 ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-0000000000a1','Nave pública de prueba','venta','industrial','19','039', 10000000, 900000, 1000, 'publicado'),
 ('22222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-0000000000a1','Borrador privado de prueba','venta','comercial','19','039', 5000000, 400000, 500, 'borrador');
insert into deal_private (deal_id, direccion_exacta, lat, lng, descripcion_completa) values
 ('11111111-1111-1111-1111-111111111111','Calle Secreta 123', 25.686613, -100.316116, 'DESCRIPCION SECRETA'),
 ('22222222-2222-2222-2222-222222222222','Calle Borrador 1', 25.7, -100.3, 'x');
insert into deal_documents (deal_id, storage_path, nombre) values
 ('11111111-1111-1111-1111-111111111111','11111111-1111-1111-1111-111111111111/estados.pdf','Estados financieros');
insert into ndas (deal_id, user_id, estado) values
 ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-0000000000b1','aprobado'),
 ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-0000000000b2','firmado');

-- Calculados y coordenadas aproximadas
do $$ declare d deals; p deal_private; begin
  select * into d from deals where id='11111111-1111-1111-1111-111111111111';
  assert d.cap_rate = 0.09, 'cap_rate = noi/precio = 0.09, fue ' || d.cap_rate;
  assert d.precio_m2 = 10000, 'precio_m2 = 10000, fue ' || d.precio_m2;
  assert d.lat_aprox is not null and abs(d.lat_aprox - 25.686613) < 0.02, 'lat_aprox cerca';
  assert d.lat_aprox <> 25.686613, 'lat_aprox no debe ser exacta';
end $$;

-- Helper para actuar como un usuario/rol
create or replace function pg_temp.as_user(uid text, r text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(uid,''), false);
  execute format('set role %I', r);
end $$;
create or replace function pg_temp.reset() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', false);
  reset role;
end $$;
grant execute on function pg_temp.as_user(text,text), pg_temp.reset() to public;

-- ===== ANÓNIMO =====
select pg_temp.as_user('', 'anon');
do $$ begin
  assert (select count(*) from deals) = 1, 'anon ve solo deals publicados';
  assert (select count(*) from deal_private) = 0, 'anon NO ve deal_private';
  assert (select count(*) from deal_documents) = 0, 'anon NO ve documentos';
  assert (select count(*) from ndas) = 0, 'anon NO ve ndas';
end $$;
select pg_temp.reset();

-- ===== INVERSIONISTA SIN NDA APROBADO (firmado, pendiente) =====
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2', 'authenticated');
do $$ begin
  assert (select count(*) from deals) = 1, 'inv ve deals publicados, no borradores';
  assert (select count(*) from deal_private) = 0, 'inv sin NDA aprobado NO ve deal_private';
  assert (select count(*) from deal_documents) = 0, 'inv sin NDA aprobado NO ve documentos';
  assert (select count(*) from ndas) = 1, 'inv ve solo su NDA';
end $$;
-- no puede auto-aprobarse
do $$ begin
  begin
    update ndas set estado='aprobado' where user_id = auth.uid();
    raise exception 'DEBIO FALLAR: autoaprobación de NDA';
  exception when others then
    assert sqlerrm like '%no puede cambiar el estado%' or sqlerrm like '%Transición%', 'error inesperado: ' || sqlerrm;
  end;
end $$;
-- no puede escalar rol
do $$ begin
  begin
    update profiles set rol='admin' where id = auth.uid();
    raise exception 'DEBIO FALLAR: escalada de rol';
  exception when others then
    assert sqlerrm like '%No autorizado%', 'error inesperado: ' || sqlerrm;
  end;
end $$;
-- no puede auto-verificarse
do $$ begin
  begin
    update profiles set estado_verificacion='verificado' where id = auth.uid();
    raise exception 'DEBIO FALLAR: autoverificación';
  exception when others then
    assert sqlerrm like '%No autorizado%', 'error inesperado: ' || sqlerrm;
  end;
end $$;
-- no puede mensajear sin NDA aprobado
do $$ begin
  begin
    insert into messages (deal_id, thread_user_id, sender_id, body)
    values ('11111111-1111-1111-1111-111111111111', auth.uid(), auth.uid(), 'hola');
    raise exception 'DEBIO FALLAR: mensaje sin NDA';
  exception when insufficient_privilege or check_violation then null;
  when others then
    assert sqlerrm like '%row-level security%', 'error inesperado: ' || sqlerrm;
  end;
end $$;
select pg_temp.reset();

-- ===== INVERSIONISTA CON NDA APROBADO =====
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1', 'authenticated');
do $$ begin
  assert (select count(*) from deal_private) = 1, 'inv con NDA ve deal_private del deal aprobado';
  assert (select descripcion_completa from deal_private) = 'DESCRIPCION SECRETA', 'lee descripción completa';
  assert (select count(*) from deal_documents) = 1, 'inv con NDA ve documentos';
  assert public.has_approved_nda('11111111-1111-1111-1111-111111111111'), 'has_approved_nda';
  assert not public.has_approved_nda('22222222-2222-2222-2222-222222222222'), 'NDA no cubre otros deals';
end $$;
-- chat permitido con NDA
insert into messages (deal_id, thread_user_id, sender_id, body)
values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b1', 'Interesado');
-- no puede suplantar remitente
do $$ begin
  begin
    insert into messages (deal_id, thread_user_id, sender_id, body)
    values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', 'suplanto');
    raise exception 'DEBIO FALLAR: suplantación';
  exception when others then assert sqlerrm like '%row-level security%', sqlerrm; end;
end $$;
-- no puede publicar ni escribir deals (no es vendedor)
do $$ begin
  begin
    insert into deals (seller_id, titulo, tipo_operacion, segmento, estado_clave, municipio_clave)
    values (auth.uid(), 'Intento invalido', 'venta', 'mixto', '19', '039');
    raise exception 'DEBIO FALLAR: inversionista creando deal';
  exception when others then assert sqlerrm like '%row-level security%', sqlerrm; end;
end $$;
select pg_temp.reset();

-- ===== VENDEDOR AJENO (B) =====
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2', 'authenticated');
do $$ begin
  assert (select count(*) from deal_private) = 0, 'vendedor ajeno NO ve deal_private';
  assert (select count(*) from deal_documents) = 0, 'vendedor ajeno NO ve documentos';
  assert (select count(*) from ndas) = 0, 'vendedor ajeno NO ve ndas ajenos';
  assert (select count(*) from messages) = 0, 'vendedor ajeno NO ve mensajes';
  assert (select count(*) from deals) = 1, 'vendedor ajeno ve solo publicados';
end $$;
do $$ begin
  begin
    update ndas set estado='aprobado' where deal_id='11111111-1111-1111-1111-111111111111';
    assert (select count(*) from ndas where estado='aprobado') = 0, 'no debe afectar filas ajenas';
  end;
end $$;
select pg_temp.reset();

-- ===== VENDEDOR DUEÑO (A) =====
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1', 'authenticated');
do $$ begin
  assert (select count(*) from deals) = 2, 'dueño ve sus 2 deals (incl. borrador)';
  assert (select count(*) from deal_private) = 2, 'dueño ve su deal_private';
  assert (select count(*) from ndas) = 2, 'dueño ve ndas de sus deals';
  assert (select count(*) from messages) = 1, 'dueño ve mensajes de NDA aprobado';
end $$;
-- aprueba el NDA firmado
update ndas set estado='aprobado' where user_id='00000000-0000-0000-0000-0000000000b2';
do $$ begin
  assert (select estado from ndas where user_id='00000000-0000-0000-0000-0000000000b2') = 'aprobado', 'dueño aprueba NDA';
  assert (select resuelto_por from ndas where user_id='00000000-0000-0000-0000-0000000000b2') = auth.uid(), 'registra resuelto_por';
end $$;
-- no puede autopublicar
do $$ begin
  begin
    update deals set status='publicado' where id='22222222-2222-2222-2222-222222222222';
    raise exception 'DEBIO FALLAR: autopublicación';
  exception when others then assert sqlerrm like '%Transición%', sqlerrm; end;
end $$;
update deals set status='en_revision' where id='22222222-2222-2222-2222-222222222222';
select pg_temp.reset();

-- Tras aprobar, el inversionista B2 ahora sí ve lo privado (RLS dinámico, no caché)
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2', 'authenticated');
do $$ begin
  assert (select count(*) from deal_private) = 1, 'tras aprobación, B2 ve deal_private';
end $$;
select pg_temp.reset();

-- ===== ADMIN =====
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1', 'authenticated');
update deals set status='publicado' where id='22222222-2222-2222-2222-222222222222';
do $$ begin
  assert (select count(*) from deals where status='publicado') = 2, 'admin publica';
  assert (select count(*) from deal_private) = 2, 'admin ve todo lo privado';
  assert (select published_at from deals where id='22222222-2222-2222-2222-222222222222') is not null, 'published_at';
end $$;
select pg_temp.reset();

-- ===== RPC de vistas =====
select pg_temp.as_user('', 'anon');
select public.record_deal_view('11111111-1111-1111-1111-111111111111');
select pg_temp.reset();
do $$ begin assert (select count(*) from deal_views) = 1, 'vista anónima registrada'; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2', 'authenticated');
do $$ begin assert (select count(*) from deal_views) = 0, 'inversionista NO lee analítica'; end $$;
select pg_temp.reset();

-- ===== saved_searches: solo el propietario =====
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1', 'authenticated');
insert into saved_searches (user_id, nombre, filtros, frecuencia)
values (auth.uid(), 'Naves', '{"estado":"19","segmento":["industrial"]}', 'diaria');
do $$ begin
  begin
    insert into saved_searches (user_id, nombre, filtros) values ('00000000-0000-0000-0000-0000000000b2', 'ajena', '{}');
    raise exception 'DEBIO FALLAR: guardar búsqueda a nombre de otro';
  exception when others then assert sqlerrm like '%row-level security%', sqlerrm; end;
end $$;
select pg_temp.reset();
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2', 'authenticated');
do $$ begin assert (select count(*) from saved_searches) = 0, 'otro usuario NO ve búsquedas ajenas'; end $$;
select pg_temp.reset();
select pg_temp.as_user('', 'anon');
do $$ begin
  begin
    insert into saved_searches (user_id, nombre, filtros) values (gen_random_uuid(), 'anon', '{}');
    raise exception 'DEBIO FALLAR: anon guardando búsqueda';
  exception when insufficient_privilege then null; when others then assert sqlerrm like '%row-level security%' or sqlerrm like '%permission denied%', sqlerrm; end;
end $$;
select pg_temp.reset();

-- ===== Fase 4: NDA/data room/chat/vistas =====
-- Usuarios extra: b3 con NDA rechazado, b4 con NDA solo 'solicitado'
insert into auth.users (id, raw_user_meta_data) values
 ('00000000-0000-0000-0000-0000000000b3', '{"rol":"inversionista","nombre":"Inv Rechazado"}'),
 ('00000000-0000-0000-0000-0000000000b4', '{"rol":"inversionista","nombre":"Inv Solo Solicitado"}');
insert into ndas (deal_id, user_id, estado) values
 ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-0000000000b3','rechazado'),
 ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-0000000000b4','solicitado');
insert into storage.objects (bucket_id, name) values
 ('data-room', '11111111-1111-1111-1111-111111111111/estados.pdf'),
 ('data-room', '22222222-2222-2222-2222-222222222222/borrador.pdf'),
 ('deal-photos', '11111111-1111-1111-1111-111111111111/fachada.jpg');

-- Storage data-room: lectura
select pg_temp.as_user('', 'anon');
do $$ begin assert (select count(*) from storage.objects where bucket_id='data-room') = 0, 'anon NO lee data-room'; end $$;
select pg_temp.reset();
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b3', 'authenticated');
do $$ begin assert (select count(*) from storage.objects where bucket_id='data-room') = 0, 'NDA rechazado NO lee data-room'; end $$;
select pg_temp.reset();
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b4', 'authenticated');
do $$ begin assert (select count(*) from storage.objects where bucket_id='data-room') = 0, 'NDA solo solicitado NO lee data-room'; end $$;
select pg_temp.reset();
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2', 'authenticated');
do $$ begin assert (select count(*) from storage.objects where bucket_id='data-room') = 0, 'vendedor ajeno NO lee data-room'; end $$;
select pg_temp.reset();
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1', 'authenticated');
do $$ begin
  assert (select count(*) from storage.objects where bucket_id='data-room') = 1, 'NDA aprobado lee SOLO el data-room de su deal';
  assert (select name from storage.objects where bucket_id='data-room') like '11111111-%', 'y no el del borrador ajeno';
end $$;
select pg_temp.reset();
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1', 'authenticated');
do $$ begin assert (select count(*) from storage.objects where bucket_id='data-room') = 2, 'dueño lee los data-room de sus deals'; end $$;
select pg_temp.reset();
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1', 'authenticated');
do $$ begin assert (select count(*) from storage.objects where bucket_id='data-room') = 2, 'admin lee todo'; end $$;
select pg_temp.reset();

-- Storage: escritura solo del dueño en su carpeta
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2', 'authenticated');
do $$ begin
  begin
    insert into storage.objects (bucket_id, name) values ('data-room', '11111111-1111-1111-1111-111111111111/malicioso.pdf');
    raise exception 'DEBIO FALLAR: vendedor ajeno subiendo al data-room';
  exception when others then assert sqlerrm like '%row-level security%', sqlerrm; end;
end $$;
select pg_temp.reset();
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1', 'authenticated');
do $$ begin
  begin
    insert into storage.objects (bucket_id, name) values ('data-room', '11111111-1111-1111-1111-111111111111/inversionista.pdf');
    raise exception 'DEBIO FALLAR: inversionista con NDA subiendo al data-room';
  exception when others then assert sqlerrm like '%row-level security%', sqlerrm; end;
  begin
    delete from storage.objects where bucket_id='data-room';
    assert (select count(*) from storage.objects where bucket_id='data-room') = 1, 'inversionista no borra data-room';
  end;
end $$;
select pg_temp.reset();
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1', 'authenticated');
insert into storage.objects (bucket_id, name) values ('data-room', '11111111-1111-1111-1111-111111111111/nuevo.pdf');
insert into storage.objects (bucket_id, name) values ('deal-photos', '11111111-1111-1111-1111-111111111111/foto2.jpg');
select pg_temp.reset();

-- Mensajes: NDA rechazado / solo solicitado no pueden escribir; el vendedor no escribe a quien no tiene NDA aprobado
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b3', 'authenticated');
do $$ begin
  begin
    insert into messages (deal_id, thread_user_id, sender_id, body) values ('11111111-1111-1111-1111-111111111111', auth.uid(), auth.uid(), 'x');
    raise exception 'DEBIO FALLAR: mensaje con NDA rechazado';
  exception when others then assert sqlerrm like '%row-level security%', sqlerrm; end;
end $$;
select pg_temp.reset();
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1', 'authenticated');
do $$ begin
  begin
    insert into messages (deal_id, thread_user_id, sender_id, body) values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000b4', auth.uid(), 'x');
    raise exception 'DEBIO FALLAR: vendedor escribiendo a hilo sin NDA aprobado';
  exception when others then assert sqlerrm like '%row-level security%', sqlerrm; end;
end $$;
-- el vendedor SÍ responde en el hilo de b1 y b1 lo recibe; b2 (otro hilo) no
insert into messages (deal_id, thread_user_id, sender_id, body)
values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000b1', auth.uid(), 'Hola, con gusto');
select pg_temp.reset();
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1', 'authenticated');
do $$ begin assert (select count(*) from messages) = 2, 'b1 ve su hilo completo (2 mensajes)'; end $$;
select pg_temp.reset();
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2', 'authenticated');
do $$ begin assert (select count(*) from messages) = 0, 'b2 NO ve el hilo de b1'; end $$;
select pg_temp.reset();

-- RPC solicitantes_nda / vistas_deal: solo dueño/admin, y sin datos de contacto
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1', 'authenticated');
do $$ declare r record; begin
  assert (select count(*) from public.solicitantes_nda('11111111-1111-1111-1111-111111111111')) = 4, 'dueño ve 4 solicitantes';
  assert (select count(*) from public.solicitantes_nda('11111111-1111-1111-1111-111111111111') where nombre = 'Inv Con NDA') = 1, 'incluye nombre';
  assert not exists (select 1 from information_schema.columns where table_name = 'solicitantes_nda' and column_name = 'telefono'), 'sin teléfono';
end $$;
select pg_temp.reset();
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2', 'authenticated');
do $$ begin
  begin perform public.solicitantes_nda('11111111-1111-1111-1111-111111111111'); raise exception 'DEBIO FALLAR';
  exception when others then assert sqlerrm like '%No autorizado%', sqlerrm; end;
  begin perform public.vistas_deal('11111111-1111-1111-1111-111111111111'); raise exception 'DEBIO FALLAR';
  exception when others then assert sqlerrm like '%No autorizado%', sqlerrm; end;
end $$;
select pg_temp.reset();
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1', 'authenticated');
do $$ begin
  begin perform public.solicitantes_nda('11111111-1111-1111-1111-111111111111'); raise exception 'DEBIO FALLAR';
  exception when others then assert sqlerrm like '%No autorizado%', sqlerrm; end;
end $$;
select pg_temp.reset();
select pg_temp.as_user('', 'anon');
do $$ begin
  begin perform public.vistas_deal('11111111-1111-1111-1111-111111111111'); raise exception 'DEBIO FALLAR';
  exception when others then assert sqlerrm like '%permission denied%' or sqlerrm like '%No autorizado%', sqlerrm; end;
end $$;
select pg_temp.reset();

-- Vistas: deduplicación 30 min para identificados; anónimas siempre cuentan; el dueño no cuenta
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1', 'authenticated');
select public.record_deal_view('11111111-1111-1111-1111-111111111111');
select public.record_deal_view('11111111-1111-1111-1111-111111111111');
select pg_temp.reset();
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1', 'authenticated');
select public.record_deal_view('11111111-1111-1111-1111-111111111111');
do $$ declare v jsonb; begin
  v := public.vistas_deal('11111111-1111-1111-1111-111111111111');
  assert (v->>'total')::int = 2, 'total = 1 anónima + 1 de b1 (dedupe) y el dueño no cuenta, fue ' || (v->>'total');
  assert (v->>'anonimas')::int = 1, 'una anónima';
  assert jsonb_array_length(v->'identificados') = 1, 'un identificado';
  assert v->'identificados'->0->>'nombre' = 'Inv Con NDA', 'nombre del identificado';
  assert not (v->'identificados'->0 ? 'telefono'), 'sin teléfono';
end $$;
select pg_temp.reset();
select pg_temp.as_user('', 'anon');
select public.record_deal_view('11111111-1111-1111-1111-111111111111');
select public.record_deal_view('11111111-1111-1111-1111-111111111111');
select pg_temp.reset();
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1', 'authenticated');
do $$ begin assert (public.vistas_deal('11111111-1111-1111-1111-111111111111')->>'total')::int = 4, 'anónimas no se deduplican'; end $$;
select pg_temp.reset();

-- Realtime: messages quedó en la publicación
do $$ begin assert exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='messages'), 'messages en supabase_realtime'; end $$;

-- ===== Fase 5: pipeline, favoritos y funciones del dashboard =====
insert into auth.users (id, raw_user_meta_data) values
 ('00000000-0000-0000-0000-0000000000b5', '{"rol":"inversionista","nombre":"Inv Cinco"}'),
 ('00000000-0000-0000-0000-0000000000b6', '{"rol":"inversionista","nombre":"Inv Seis"}'),
 ('00000000-0000-0000-0000-0000000000b7', '{"rol":"inversionista","nombre":"Inv Siete"}');
-- b6 ya seguía el deal ('visto'); b7 lo había descartado; b5 no tenía nada
insert into pipeline_items (user_id, deal_id, etapa) values
 ('00000000-0000-0000-0000-0000000000b6', '11111111-1111-1111-1111-111111111111', 'visto'),
 ('00000000-0000-0000-0000-0000000000b7', '11111111-1111-1111-1111-111111111111', 'descartado');
insert into ndas (deal_id, user_id, estado) values
 ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-0000000000b6','solicitado'),
 ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-0000000000b7','solicitado');
insert into ndas (deal_id, user_id, estado, firma_nombre, firmado_at) values
 ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-0000000000b5','firmado','Inv Cinco Firma', now());
update ndas set estado = 'firmado', firma_nombre = 'Firma', firmado_at = now()
 where user_id in ('00000000-0000-0000-0000-0000000000b6','00000000-0000-0000-0000-0000000000b7');
do $$ begin
  assert (select etapa from pipeline_items where user_id='00000000-0000-0000-0000-0000000000b5') = 'nda', 'sin item previo -> nda';
  assert (select etapa from pipeline_items where user_id='00000000-0000-0000-0000-0000000000b6') = 'nda', 'visto -> nda';
  assert (select etapa from pipeline_items where user_id='00000000-0000-0000-0000-0000000000b7') = 'descartado', 'descartado NO se pisa';
end $$;
-- el inversionista avanza a 'oferta'; la aprobación posterior no lo regresa
update pipeline_items set etapa = 'oferta' where user_id='00000000-0000-0000-0000-0000000000b5';
update ndas set estado = 'aprobado' where user_id='00000000-0000-0000-0000-0000000000b5';
do $$ begin assert (select etapa from pipeline_items where user_id='00000000-0000-0000-0000-0000000000b5') = 'oferta', 'oferta NO se pisa'; end $$;
update ndas set estado = 'firmado' where user_id='00000000-0000-0000-0000-0000000000b5'; -- (superusuario) lo dejamos pendiente para las pruebas del vendedor
do $$ begin
  begin update pipeline_items set notas = repeat('x', 2001) where user_id='00000000-0000-0000-0000-0000000000b6'; raise exception 'DEBIO FALLAR';
  exception when check_violation then null; end;
end $$;

-- RLS del pipeline y favoritos: solo lo propio
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b6', 'authenticated');
do $$ begin
  assert (select count(*) from pipeline_items) = 1, 'b6 ve solo su pipeline';
  update pipeline_items set etapa = 'due_diligence', notas = 'Revisar contratos' where user_id = auth.uid();
  assert (select etapa from pipeline_items) = 'due_diligence', 'mueve su tarjeta';
  update pipeline_items set etapa = 'cierre' where user_id <> auth.uid();
  assert (select count(*) from pipeline_items) = 1, 'no toca ajenas';
  insert into favorites (user_id, deal_id) values (auth.uid(), '11111111-1111-1111-1111-111111111111');
  begin
    insert into favorites (user_id, deal_id) values ('00000000-0000-0000-0000-0000000000b7', '11111111-1111-1111-1111-111111111111');
    raise exception 'DEBIO FALLAR: favorito a nombre de otro';
  exception when others then assert sqlerrm like '%row-level security%', sqlerrm; end;
  begin
    insert into pipeline_items (user_id, deal_id, etapa) values ('00000000-0000-0000-0000-0000000000b7', '22222222-2222-2222-2222-222222222222', 'visto');
    raise exception 'DEBIO FALLAR: pipeline a nombre de otro';
  exception when others then assert sqlerrm like '%row-level security%', sqlerrm; end;
end $$;
select pg_temp.reset();
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b7', 'authenticated');
do $$ begin
  assert (select count(*) from favorites) = 0, 'b7 NO ve favoritos de b6';
  assert (select count(*) from pipeline_items where notas is not null) = 0, 'b7 NO ve notas de b6';
end $$;
select pg_temp.reset();

-- Funciones del vendedor
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1', 'authenticated');
do $$ declare r record; begin
  assert (select count(*) from public.deals_vendedor_stats()) = 2, 'stats: una fila por deal propio';
  select * into r from public.deals_vendedor_stats() where deal_id = '11111111-1111-1111-1111-111111111111';
  assert r.vistas_total = 4, 'vistas_total, fue ' || r.vistas_total;
  assert r.ndas_pendientes = 3, 'ndas_pendientes (b5,b6,b7), fue ' || r.ndas_pendientes;
  assert r.ndas_aprobados = 2, 'ndas_aprobados (b1,b2), fue ' || r.ndas_aprobados;
  assert r.mensajes = 2, 'mensajes';
  assert (select count(*) from public.solicitudes_pendientes_vendedor()) = 3, 'solicitudes pendientes = 3';
  assert (select count(*) from public.solicitudes_pendientes_vendedor() where nombre = 'Inv Cinco' and firma_nombre = 'Inv Cinco Firma') = 1, 'nombre y firma';
  assert (select count(*) from public.hilos_vendedor()) = 1, 'un hilo';
  select * into r from public.hilos_vendedor();
  assert r.nombre = 'Inv Con NDA' and r.total = 2 and r.ultimo_body = 'Hola, con gusto' and r.ultimo_sender = '00000000-0000-0000-0000-0000000000a1', 'último mensaje del hilo';
  assert not exists (select 1 from information_schema.columns where table_name in ('hilos_vendedor','solicitudes_pendientes_vendedor') and column_name in ('telefono','email')), 'sin datos de contacto';
end $$;
select pg_temp.reset();
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2', 'authenticated');
do $$ begin
  assert (select count(*) from public.deals_vendedor_stats()) = 0, 'otro vendedor: sin stats ajenas';
  assert (select count(*) from public.solicitudes_pendientes_vendedor()) = 0, 'otro vendedor: sin solicitudes ajenas';
  assert (select count(*) from public.hilos_vendedor()) = 0, 'otro vendedor: sin hilos ajenos';
end $$;
select pg_temp.reset();
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1', 'authenticated');
do $$ begin
  assert (select count(*) from public.hilos_vendedor()) = 0, 'el inversionista no es vendedor: sin hilos';
  assert (select count(*) from public.solicitudes_pendientes_vendedor()) = 0, 'el inversionista no ve solicitudes';
end $$;
select pg_temp.reset();
select pg_temp.as_user('', 'anon');
do $$ begin
  begin perform public.hilos_vendedor(); raise exception 'DEBIO FALLAR';
  exception when others then assert sqlerrm like '%permission denied%', sqlerrm; end;
  begin perform public.deals_vendedor_stats(); raise exception 'DEBIO FALLAR';
  exception when others then assert sqlerrm like '%permission denied%', sqlerrm; end;
end $$;
select pg_temp.reset();

-- ===== Fase 7: moderación, verificación, reapertura de NDA y auditoría =====
insert into deals (id, seller_id, titulo, tipo_operacion, segmento, estado_clave, municipio_clave, precio, status) values
 ('33333333-3333-3333-3333-333333333333','00000000-0000-0000-0000-0000000000a1','Deal en revisión de prueba','venta','mixto','19','039', 3000000, 'en_revision'),
 ('44444444-4444-4444-4444-444444444444','00000000-0000-0000-0000-0000000000a1','Otro deal en revisión','venta','mixto','19','039', 4000000, 'en_revision');

-- Solo admin: dueño, inversionista y anónimo NO pueden moderar, verificar, reabrir ni ver el resumen
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1', 'authenticated');
do $$ begin
  begin perform public.moderar_deal('33333333-3333-3333-3333-333333333333', 'aprobar'); raise exception 'DEBIO FALLAR: dueño autoaprobándose';
  exception when others then assert sqlerrm like '%No autorizado%', sqlerrm; end;
  begin perform public.verificar_usuario('00000000-0000-0000-0000-0000000000a1', 'verificado'); raise exception 'DEBIO FALLAR: autoverificación por RPC';
  exception when others then assert sqlerrm like '%No autorizado%', sqlerrm; end;
  begin perform public.reabrir_nda(gen_random_uuid(), 'motivo suficientemente largo'); raise exception 'DEBIO FALLAR';
  exception when others then assert sqlerrm like '%No autorizado%', sqlerrm; end;
  begin perform public.admin_resumen(); raise exception 'DEBIO FALLAR';
  exception when others then assert sqlerrm like '%No autorizado%', sqlerrm; end;
  -- el trigger sigue impidiendo el atajo por UPDATE directo y escribir la nota de verificación
  begin update profiles set nota_verificacion = 'verificado por mí' where id = auth.uid(); raise exception 'DEBIO FALLAR: nota propia';
  exception when others then assert sqlerrm like '%No autorizado%', sqlerrm; end;
  begin update deals set status = 'publicado' where id = '33333333-3333-3333-3333-333333333333'; raise exception 'DEBIO FALLAR: autopublicación';
  exception when others then assert sqlerrm like '%Transición%', sqlerrm; end;
  begin insert into admin_audit (entidad, entidad_id, accion) values ('deal', gen_random_uuid(), 'falsa'); raise exception 'DEBIO FALLAR: forjar auditoría';
  exception when others then assert sqlerrm like '%permission denied%', sqlerrm; end;
  assert (select count(*) from admin_audit) = 0, 'el dueño no lee la bitácora';
end $$;
select pg_temp.reset();
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1', 'authenticated');
do $$ begin
  begin perform public.moderar_deal('33333333-3333-3333-3333-333333333333', 'aprobar'); raise exception 'DEBIO FALLAR';
  exception when others then assert sqlerrm like '%No autorizado%', sqlerrm; end;
  begin perform public.verificar_usuario('00000000-0000-0000-0000-0000000000b1', 'verificado'); raise exception 'DEBIO FALLAR';
  exception when others then assert sqlerrm like '%No autorizado%', sqlerrm; end;
  assert (select count(*) from admin_audit) = 0, 'el inversionista no lee la bitácora';
end $$;
select pg_temp.reset();
select pg_temp.as_user('', 'anon');
do $$ begin
  begin perform public.moderar_deal('33333333-3333-3333-3333-333333333333', 'aprobar'); raise exception 'DEBIO FALLAR';
  exception when others then assert sqlerrm like '%permission denied%', sqlerrm; end;
  begin perform public.admin_resumen(); raise exception 'DEBIO FALLAR';
  exception when others then assert sqlerrm like '%permission denied%', sqlerrm; end;
end $$;
select pg_temp.reset();

-- Moderación (admin c1): validaciones y máquina de estados
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1', 'authenticated');
do $$ begin
  begin perform public.moderar_deal('33333333-3333-3333-3333-333333333333', 'rechazar'); raise exception 'DEBIO FALLAR: sin motivo';
  exception when others then assert sqlerrm like '%motivo%', sqlerrm; end;
  begin perform public.moderar_deal('33333333-3333-3333-3333-333333333333', 'rechazar', 'corto'); raise exception 'DEBIO FALLAR: motivo corto';
  exception when others then assert sqlerrm like '%motivo%', sqlerrm; end;
  begin perform public.moderar_deal('33333333-3333-3333-3333-333333333333', 'inventada'); raise exception 'DEBIO FALLAR';
  exception when others then assert sqlerrm like '%Acción desconocida%', sqlerrm; end;
  begin perform public.moderar_deal(gen_random_uuid(), 'aprobar'); raise exception 'DEBIO FALLAR';
  exception when others then assert sqlerrm like '%no encontrado%', sqlerrm; end;
  begin perform public.moderar_deal('44444444-4444-4444-4444-444444444444', 'despublicar', 'motivo suficientemente largo'); raise exception 'DEBIO FALLAR: despublicar algo no publicado';
  exception when others then assert sqlerrm like '%Solo se despublican%', sqlerrm; end;
  assert (select count(*) from admin_audit) = 0, 'los intentos fallidos no dejan rastro (rollback)';
  assert public.moderar_deal('33333333-3333-3333-3333-333333333333', 'rechazar', 'Faltan fotos y el NOI no cuadra') = 'borrador', 'rechazar -> borrador';
end $$;
select pg_temp.reset();
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1', 'authenticated');
do $$ begin
  assert (select motivo_rechazo from deals where id='33333333-3333-3333-3333-333333333333') = 'Faltan fotos y el NOI no cuadra', 'el vendedor ve el motivo';
  assert (select status from deals where id='33333333-3333-3333-3333-333333333333') = 'borrador', 'volvió a borrador';
  -- no puede borrar ni falsear el motivo, pero sí reenviar a revisión
  update deals set motivo_rechazo = null where id='33333333-3333-3333-3333-333333333333';
  assert (select motivo_rechazo from deals where id='33333333-3333-3333-3333-333333333333') is not null, 'el vendedor no borra el motivo';
  update deals set status = 'en_revision' where id='33333333-3333-3333-3333-333333333333';
end $$;
select pg_temp.reset();
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1', 'authenticated');
do $$ begin
  assert public.moderar_deal('33333333-3333-3333-3333-333333333333', 'aprobar') = 'publicado', 'aprobar -> publicado';
  assert (select published_at from deals where id='33333333-3333-3333-3333-333333333333') is not null, 'published_at al publicar';
  assert (select motivo_rechazo from deals where id='33333333-3333-3333-3333-333333333333') is null, 'aprobar limpia el motivo';
  begin perform public.moderar_deal('33333333-3333-3333-3333-333333333333', 'aprobar'); raise exception 'DEBIO FALLAR: doble aprobación';
  exception when others then assert sqlerrm like '%Solo se aprueban%', sqlerrm; end;
  begin perform public.moderar_deal('33333333-3333-3333-3333-333333333333', 'rechazar', 'motivo suficientemente largo'); raise exception 'DEBIO FALLAR: rechazar publicado';
  exception when others then assert sqlerrm like '%Solo se rechazan%', sqlerrm; end;
end $$;
select pg_temp.reset();
-- publicado: lo ve cualquiera; al despublicar desaparece del público
select pg_temp.as_user('', 'anon');
do $$ begin assert (select count(*) from deals where id='33333333-3333-3333-3333-333333333333') = 1, 'publicado es público'; end $$;
select pg_temp.reset();
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1', 'authenticated');
do $$ begin assert public.moderar_deal('33333333-3333-3333-3333-333333333333', 'despublicar', 'Reporte de duplicado, en revisión') = 'borrador', 'despublicar -> borrador'; end $$;
select pg_temp.reset();
select pg_temp.as_user('', 'anon');
do $$ begin assert (select count(*) from deals where id='33333333-3333-3333-3333-333333333333') = 0, 'despublicado ya no es público'; end $$;
select pg_temp.reset();

-- Bitácora: 3 acciones sobre el deal, con detalle completo, solo legible por admin
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1', 'authenticated');
do $$ declare r record; begin
  assert (select count(*) from admin_audit where entidad='deal' and entidad_id='33333333-3333-3333-3333-333333333333') = 3, 'tres acciones auditadas';
  assert (select array_agg(accion order by id) from admin_audit where entidad_id='33333333-3333-3333-3333-333333333333') = array['rechazar','aprobar','despublicar'], 'orden de acciones';
  select * into r from admin_audit where accion='rechazar' and entidad_id='33333333-3333-3333-3333-333333333333';
  assert r.admin_id = auth.uid() and r.detalle->>'de' = 'en_revision' and r.detalle->>'a' = 'borrador' and r.detalle->>'motivo' = 'Faltan fotos y el NOI no cuadra', 'detalle de auditoría';
end $$;
select pg_temp.reset();

-- Verificación de usuarios
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1', 'authenticated');
do $$ begin
  begin perform public.verificar_usuario('00000000-0000-0000-0000-0000000000b2', 'rechazado'); raise exception 'DEBIO FALLAR: rechazo sin nota';
  exception when others then assert sqlerrm like '%motivo%', sqlerrm; end;
  begin perform public.verificar_usuario('00000000-0000-0000-0000-0000000000c1', 'verificado'); raise exception 'DEBIO FALLAR: sobre un admin';
  exception when others then assert sqlerrm like '%admin%', sqlerrm; end;
  begin perform public.verificar_usuario(gen_random_uuid(), 'verificado'); raise exception 'DEBIO FALLAR';
  exception when others then assert sqlerrm like '%no encontrado%', sqlerrm; end;
  perform public.verificar_usuario('00000000-0000-0000-0000-0000000000a1', 'verificado', 'Registro de asesor validado');
  perform public.verificar_usuario('00000000-0000-0000-0000-0000000000b2', 'rechazado', 'Datos de contacto falsos');
  assert (select estado_verificacion from profiles where id='00000000-0000-0000-0000-0000000000a1') = 'verificado', 'verificado';
  assert (select estado_verificacion from profiles where id='00000000-0000-0000-0000-0000000000b2') = 'rechazado', 'rechazado';
  -- revocar
  perform public.verificar_usuario('00000000-0000-0000-0000-0000000000a1', 'pendiente');
  assert (select nota_verificacion from profiles where id='00000000-0000-0000-0000-0000000000a1') is null, 'revocar limpia la nota';
  perform public.verificar_usuario('00000000-0000-0000-0000-0000000000a1', 'verificado', 'Registro de asesor validado');
  assert (select count(*) from admin_audit where entidad = 'usuario') = 4, 'verificaciones auditadas';
end $$;
select pg_temp.reset();
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2', 'authenticated');
do $$ begin assert (select nota_verificacion from profiles where id = auth.uid()) = 'Datos de contacto falsos', 'el usuario ve el motivo de su rechazo'; end $$;
select pg_temp.reset();
select pg_temp.as_user('', 'anon');
do $$ begin assert (select count(*) from seller_public where id='00000000-0000-0000-0000-0000000000a1') = 1, 'seller_public sigue sin exponer la nota'; 
  assert not exists (select 1 from information_schema.columns where table_name='seller_public' and column_name='nota_verificacion'), 'la vista pública no incluye la nota'; end $$;
select pg_temp.reset();

-- Reabrir NDA rechazado
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1', 'authenticated');
do $$ begin
  begin perform public.reabrir_nda((select id from ndas where user_id='00000000-0000-0000-0000-0000000000b3'), 'motivo suficientemente largo'); raise exception 'DEBIO FALLAR: el vendedor no reabre';
  exception when others then assert sqlerrm like '%No autorizado%', sqlerrm; end;
end $$;
select pg_temp.reset();
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1', 'authenticated');
do $$ declare nid uuid; begin
  select id into nid from ndas where user_id='00000000-0000-0000-0000-0000000000b3' and deal_id='11111111-1111-1111-1111-111111111111';
  begin perform public.reabrir_nda(nid, 'corto'); raise exception 'DEBIO FALLAR: motivo corto';
  exception when others then assert sqlerrm like '%motivo%', sqlerrm; end;
  begin perform public.reabrir_nda((select id from ndas where user_id='00000000-0000-0000-0000-0000000000b1'), 'motivo suficientemente largo'); raise exception 'DEBIO FALLAR: aprobado no se reabre';
  exception when others then assert sqlerrm like '%Solo se reabren%', sqlerrm; end;
  perform public.reabrir_nda(nid, 'Error del vendedor al rechazar');
  assert (select estado from ndas where id = nid) = 'firmado', 'reabierto -> firmado';
  assert (select resuelto_por from ndas where id = nid) is null, 'resuelto_por limpio';
  begin perform public.reabrir_nda(nid, 'motivo suficientemente largo'); raise exception 'DEBIO FALLAR: ya reabierto';
  exception when others then assert sqlerrm like '%Solo se reabren%', sqlerrm; end;
  assert (select count(*) from admin_audit where entidad = 'nda' and accion = 'reabrir') = 1, 'reapertura auditada';
end $$;
select pg_temp.reset();
-- El vendedor ahora puede decidir; el investigador sigue sin acceso hasta que apruebe
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b3', 'authenticated');
do $$ begin assert (select count(*) from deal_private) = 0, 'reabierto no da acceso por sí solo'; end $$;
select pg_temp.reset();
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1', 'authenticated');
update ndas set estado = 'aprobado' where user_id='00000000-0000-0000-0000-0000000000b3' and estado = 'firmado';
select pg_temp.reset();
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b3', 'authenticated');
do $$ begin assert (select count(*) from deal_private) = 1, 'tras la aprobación del vendedor, sí hay acceso'; end $$;
select pg_temp.reset();

-- Resumen y vistas del admin
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1', 'authenticated');
do $$ declare v jsonb; vistas_antes int; begin
  v := public.admin_resumen();
  assert (select sum(value::int) from jsonb_each_text(v->'deals')) = (select count(*) from deals), 'resumen: suma de deals';
  assert (v->'deals'->>'en_revision')::int = 1, 'resumen: 1 en revisión (el 4444)';
  assert (v->>'ndas_firmados')::int >= 3, 'resumen: ndas firmados';
  assert (v->'usuarios'->>'rechazado')::int = 1, 'resumen: usuarios rechazados';
end $$;
select pg_temp.reset();
do $$ begin perform set_config('dealmx.vistas_antes', (select count(*) from deal_views)::text, false); end $$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1', 'authenticated');
select public.record_deal_view('11111111-1111-1111-1111-111111111111');
select pg_temp.reset();
do $$ begin assert (select count(*) from deal_views)::text = current_setting('dealmx.vistas_antes'), 'las vistas de un admin no cuentan'; end $$;

-- ===== Fase 8: edición de deals y re-moderación =====
insert into deals (id, seller_id, titulo, tipo_operacion, segmento, estado_clave, municipio_clave, precio, noi_anual, status) values
 ('55555555-5555-5555-5555-555555555555','00000000-0000-0000-0000-0000000000a1','Deal publicado editable','venta','mixto','19','039', 9000000, 700000, 'publicado'),
 ('66666666-6666-6666-6666-666666666666','00000000-0000-0000-0000-0000000000a1','Borrador editable','venta','mixto','19','039', 2000000, 100000, 'borrador'),
 ('77777777-7777-7777-7777-777777777777','00000000-0000-0000-0000-0000000000a1','Deal cerrado','venta','mixto','19','039', 3000000, 200000, 'cerrado'),
 ('88888888-8888-8888-8888-888888888888','00000000-0000-0000-0000-0000000000a1','Deal publicado, retiro voluntario','venta','mixto','19','039', 4000000, 300000, 'publicado');
insert into deal_private (deal_id, direccion_exacta, lat, lng, descripcion_completa) values
 ('55555555-5555-5555-5555-555555555555', 'Calle Original 1', 25.70, -100.30, 'Descripción original');
select set_config('dealmx.t0', (select published_at::text from deals where id = '55555555-5555-5555-5555-555555555555'), false);
do $$ begin assert current_setting('dealmx.t0') is not null and current_setting('dealmx.t0') <> '', 'el deal publicado tiene published_at'; end $$;

-- El dueño edita un campo material de un deal PUBLICADO -> vuelve a revisión; published_at (primera publicación) no cambia
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1', 'authenticated');
do $$ begin
  update deals set precio = 5000000 where id = '55555555-5555-5555-5555-555555555555';
  assert (select status from deals where id = '55555555-5555-5555-5555-555555555555') = 'en_revision', 'editar el precio de un publicado -> en_revision';
  assert (select precio from deals where id = '55555555-5555-5555-5555-555555555555') = 5000000, 'el cambio sí se guardó';
  assert (select published_at::text from deals where id = '55555555-5555-5555-5555-555555555555') = current_setting('dealmx.t0'), 'published_at no cambia al editar';
  begin
    update deals set status = 'publicado' where id = '55555555-5555-5555-5555-555555555555';
    raise exception 'DEBIO FALLAR: el vendedor no se auto-aprueba';
  exception when others then assert sqlerrm like '%Transición%', sqlerrm; end;
end $$;
select pg_temp.reset();

-- Datos privados: un UPDATE sin cambios NO reabre revisión; uno con cambios SÍ
update deals set status = 'publicado' where id = '55555555-5555-5555-5555-555555555555';  -- (superusuario) restaura
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1', 'authenticated');
do $$ begin
  update deal_private set direccion_exacta = 'Calle Original 1', lat = 25.70, lng = -100.30, descripcion_completa = 'Descripción original'
    where deal_id = '55555555-5555-5555-5555-555555555555';
  assert (select status from deals where id = '55555555-5555-5555-5555-555555555555') = 'publicado', 'guardar datos privados SIN cambios no reabre la revisión';
  update deal_private set descripcion_completa = 'Descripción nueva' where deal_id = '55555555-5555-5555-5555-555555555555';
  assert (select status from deals where id = '55555555-5555-5555-5555-555555555555') = 'en_revision', 'cambiar datos privados de un publicado -> en_revision';
end $$;
select pg_temp.reset();

-- No se puede falsear la ubicación pública de un deal publicado
update deals set status = 'publicado' where id = '55555555-5555-5555-5555-555555555555';
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1', 'authenticated');
do $$ begin
  update deals set lat_aprox = 19.4, lng_aprox = -99.1 where id = '55555555-5555-5555-5555-555555555555';
  assert (select status from deals where id = '55555555-5555-5555-5555-555555555555') = 'en_revision', 'cambiar la ubicación pública de un publicado -> en_revision';
end $$;
select pg_temp.reset();

-- Borrador: se edita libremente y sigue borrador. Cerrado: congelado.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1', 'authenticated');
do $$ begin
  update deals set precio = 2500000, titulo = 'Borrador editado' where id = '66666666-6666-6666-6666-666666666666';
  assert (select status from deals where id = '66666666-6666-6666-6666-666666666666') = 'borrador', 'editar un borrador lo deja en borrador';
  assert (select titulo from deals where id = '66666666-6666-6666-6666-666666666666') = 'Borrador editado', 'el borrador se editó';
  begin
    update deals set precio = 3500000 where id = '77777777-7777-7777-7777-777777777777';
    raise exception 'DEBIO FALLAR: editar un cerrado';
  exception when others then assert sqlerrm like '%cerrado no se edita%', sqlerrm; end;
  begin
    update deals set status = 'publicado' where id = '77777777-7777-7777-7777-777777777777';
    raise exception 'DEBIO FALLAR: reabrir un cerrado';
  exception when others then assert sqlerrm like '%Transición%', sqlerrm; end;
end $$;
select pg_temp.reset();

-- El dueño puede retirar voluntariamente un publicado a revisión (no volver a publicarlo)
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1', 'authenticated');
do $$ begin
  update deals set status = 'en_revision' where id = '88888888-8888-8888-8888-888888888888';
  assert (select status from deals where id = '88888888-8888-8888-8888-888888888888') = 'en_revision', 'retiro voluntario a revisión';
  begin
    update deals set status = 'publicado' where id = '88888888-8888-8888-8888-888888888888';
    raise exception 'DEBIO FALLAR';
  exception when others then assert sqlerrm like '%Transición%', sqlerrm; end;
end $$;
select pg_temp.reset();

-- Otro vendedor no edita deals ajenos; el admin edita sin que cambie el estado; al re-aprobar se conserva published_at
update deals set status = 'publicado' where id = '55555555-5555-5555-5555-555555555555';
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2', 'authenticated');
do $$ declare n int; begin
  update deals set precio = 1 where id = '55555555-5555-5555-5555-555555555555';
  get diagnostics n = row_count;
  assert n = 0, 'otro vendedor no puede editar deals ajenos';
end $$;
select pg_temp.reset();
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1', 'authenticated');
do $$ begin
  update deals set precio = 6000000 where id = '55555555-5555-5555-5555-555555555555';
  assert (select status from deals where id = '55555555-5555-5555-5555-555555555555') = 'publicado', 'el admin edita sin reabrir la revisión';
end $$;
select pg_temp.reset();
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1', 'authenticated');
update deals set titulo = 'Editado por el dueño' where id = '55555555-5555-5555-5555-555555555555';
select pg_temp.reset();
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1', 'authenticated');
do $$ begin
  assert public.moderar_deal('55555555-5555-5555-5555-555555555555', 'aprobar') = 'publicado', 're-aprobar';
  assert (select published_at::text from deals where id = '55555555-5555-5555-5555-555555555555') = current_setting('dealmx.t0'),
    'al re-aprobar se conserva la primera fecha de publicación (no se reenvían alertas)';
end $$;
select pg_temp.reset();

\echo 'RLS: TODAS LAS PRUEBAS PASARON'
