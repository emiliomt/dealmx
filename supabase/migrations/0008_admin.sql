-- DealMX · 0008 · administración: moderación de deals, verificación de usuarios, reapertura de NDAs y auditoría

alter table profiles add column nota_verificacion text;

-- Solo admin puede tocar rol, verificación y su nota (antes: rol y estado_verificacion).
create or replace function public.guard_profile_privileged_cols() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.rol is distinct from old.rol
       or new.estado_verificacion is distinct from old.estado_verificacion
       or new.nota_verificacion is distinct from old.nota_verificacion then
      raise exception 'No autorizado para modificar rol o verificación';
    end if;
  end if;
  return new;
end $$;

-- Un admin puede reabrir un NDA rechazado (rechazado -> firmado) para que el vendedor lo decida de nuevo.
-- Mismo resto de reglas que en 0002.
create or replace function public.guard_nda_transition() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;  -- service role (route handler de firma agrega IP)
  if tg_op = 'UPDATE' then
    if new.deal_id <> old.deal_id or new.user_id <> old.user_id then raise exception 'Campos inmutables'; end if;
    if new.estado is distinct from old.estado then
      if old.user_id = auth.uid() and not (public.is_deal_owner(old.deal_id) or public.is_admin()) then
        raise exception 'El inversionista no puede cambiar el estado del NDA directamente';
      end if;
      if old.estado = 'firmado' and new.estado in ('aprobado','rechazado') then
        new.resuelto_por := auth.uid(); new.resuelto_at := now();
      elsif old.estado = 'rechazado' and new.estado = 'firmado' and public.is_admin() then
        new.resuelto_por := null; new.resuelto_at := null;
      else
        raise exception 'Transición de NDA no permitida: % -> %', old.estado, new.estado;
      end if;
    end if;
    new.firma_nombre := old.firma_nombre; new.firmado_at := old.firmado_at; new.firma_ip := old.firma_ip;
    new.texto_snapshot := old.texto_snapshot; new.template_version := old.template_version;
  end if;
  return new;
end $$;

-- Las vistas del propio equipo admin no inflan la analítica del vendedor.
create or replace function public.record_deal_view(p_deal uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from deals where id = p_deal and status in ('publicado','en_negociacion','cerrado'))
     or public.is_deal_owner(p_deal) or public.is_admin() then
    return;
  end if;
  if auth.uid() is not null and exists (
    select 1 from deal_views where deal_id = p_deal and viewer_id = auth.uid() and viewed_at > now() - interval '30 minutes'
  ) then
    return;
  end if;
  insert into deal_views (deal_id, viewer_id) values (p_deal, auth.uid());
end $$;

-- Bitácora de acciones administrativas. Solo se escribe desde las funciones de abajo (SECURITY DEFINER).
create table admin_audit (
  id bigint generated always as identity primary key,
  admin_id uuid references profiles(id) on delete set null,
  entidad text not null check (entidad in ('deal', 'usuario', 'nda')),
  entidad_id uuid not null,
  accion text not null,
  detalle jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index admin_audit_created_idx on admin_audit (created_at desc);
alter table admin_audit enable row level security;
create policy "audit lectura admin" on admin_audit for select to authenticated using (public.is_admin());
-- Defensa en profundidad: sin INSERT/UPDATE/DELETE para los roles de la API (aunque no haya políticas que los permitan).
revoke insert, update, delete on admin_audit from anon, authenticated;

-- Moderación. Acciones y transiciones válidas (las impone la BD, no la interfaz):
--   aprobar     en_revision                    -> publicado
--   rechazar    en_revision (motivo ≥ 10)      -> borrador
--   despublicar publicado|en_negociacion (motivo ≥ 10) -> borrador
create or replace function public.moderar_deal(p_deal uuid, p_accion text, p_motivo text default null)
returns deal_status language plpgsql security definer set search_path = public as $$
declare d deals; nuevo deal_status; motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  if not public.is_admin() then raise exception 'No autorizado'; end if;
  select * into d from deals where id = p_deal for update;
  if not found then raise exception 'Deal no encontrado'; end if;

  if p_accion = 'aprobar' then
    if d.status <> 'en_revision' then raise exception 'Solo se aprueban deals en revisión'; end if;
    nuevo := 'publicado'; motivo := null;
  elsif p_accion = 'rechazar' then
    if d.status <> 'en_revision' then raise exception 'Solo se rechazan deals en revisión'; end if;
    if motivo is null or char_length(motivo) < 10 then raise exception 'Indica el motivo (mínimo 10 caracteres)'; end if;
    nuevo := 'borrador';
  elsif p_accion = 'despublicar' then
    if d.status not in ('publicado', 'en_negociacion') then raise exception 'Solo se despublican deals publicados o en negociación'; end if;
    if motivo is null or char_length(motivo) < 10 then raise exception 'Indica el motivo (mínimo 10 caracteres)'; end if;
    nuevo := 'borrador';
  else
    raise exception 'Acción desconocida';
  end if;

  update deals set status = nuevo, motivo_rechazo = motivo where id = p_deal;
  insert into admin_audit (admin_id, entidad, entidad_id, accion, detalle)
  values (auth.uid(), 'deal', p_deal, p_accion, jsonb_build_object('de', d.status, 'a', nuevo, 'motivo', motivo, 'titulo', d.titulo));
  return nuevo;
end $$;

-- Verificación de usuarios (rechazar exige nota; aprobar/revocar la admiten).
create or replace function public.verificar_usuario(p_user uuid, p_estado estado_verificacion, p_nota text default null)
returns void language plpgsql security definer set search_path = public as $$
declare nota text := nullif(btrim(coalesce(p_nota, '')), ''); u profiles;
begin
  if not public.is_admin() then raise exception 'No autorizado'; end if;
  select * into u from profiles where id = p_user for update;
  if not found then raise exception 'Usuario no encontrado'; end if;
  if u.rol = 'admin' then raise exception 'No se modifica la verificación de un admin'; end if;
  if p_estado = 'rechazado' and nota is null then raise exception 'Indica el motivo del rechazo'; end if;
  update profiles set estado_verificacion = p_estado, nota_verificacion = nota where id = p_user;
  insert into admin_audit (admin_id, entidad, entidad_id, accion, detalle)
  values (auth.uid(), 'usuario', p_user, p_estado::text, jsonb_build_object('de', u.estado_verificacion, 'nota', nota, 'nombre', u.nombre));
end $$;

-- Reabrir un NDA rechazado (p. ej. error del vendedor): vuelve a 'firmado' para que el vendedor decida de nuevo.
create or replace function public.reabrir_nda(p_nda uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare n ndas; motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  if not public.is_admin() then raise exception 'No autorizado'; end if;
  if motivo is null or char_length(motivo) < 10 then raise exception 'Indica el motivo (mínimo 10 caracteres)'; end if;
  select * into n from ndas where id = p_nda for update;
  if not found then raise exception 'NDA no encontrado'; end if;
  if n.estado <> 'rechazado' then raise exception 'Solo se reabren NDAs rechazados'; end if;
  update ndas set estado = 'firmado' where id = p_nda;
  insert into admin_audit (admin_id, entidad, entidad_id, accion, detalle)
  values (auth.uid(), 'nda', p_nda, 'reabrir', jsonb_build_object('deal_id', n.deal_id, 'user_id', n.user_id, 'motivo', motivo));
end $$;

-- Conteos para el encabezado de /admin.
create or replace function public.admin_resumen() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'No autorizado'; end if;
  return jsonb_build_object(
    'deals', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (select status, count(*) n from deals group by status) x),
    'usuarios', (select coalesce(jsonb_object_agg(estado_verificacion, n), '{}'::jsonb) from (select estado_verificacion, count(*) n from profiles where rol <> 'admin' group by estado_verificacion) x),
    'ndas_firmados', (select count(*) from ndas where estado = 'firmado')
  );
end $$;

revoke all on function public.moderar_deal(uuid, text, text) from public, anon;
revoke all on function public.verificar_usuario(uuid, estado_verificacion, text) from public, anon;
revoke all on function public.reabrir_nda(uuid, text) from public, anon;
revoke all on function public.admin_resumen() from public, anon;
grant execute on function public.moderar_deal(uuid, text, text) to authenticated;
grant execute on function public.verificar_usuario(uuid, estado_verificacion, text) to authenticated;
grant execute on function public.reabrir_nda(uuid, text) to authenticated;
grant execute on function public.admin_resumen() to authenticated;
