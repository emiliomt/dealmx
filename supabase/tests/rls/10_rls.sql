-- Pruebas de RLS. Cualquier aserción fallida lanza excepción y el runner sale con error.
\set ON_ERROR_STOP on

grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to authenticated, service_role;
grant select on all tables in schema public to anon;
grant execute on all functions in schema public to anon, authenticated, service_role;

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

\echo 'RLS: TODAS LAS PRUEBAS PASARON'
