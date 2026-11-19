-- DealMX · 0009 · edición de deals con re-moderación
--
-- Antes, la BD solo vigilaba `status`, `seller_id`, `es_ejemplo`, `motivo_rechazo` y `published_at` de un vendedor:
-- cualquier otra columna (precio, NOI, descripción…) se podía cambiar en un deal YA PUBLICADO sin pasar por moderación.
-- Ahora, si un vendedor (no admin) cambia un campo material de un deal publicado o en negociación, el deal vuelve
-- automáticamente a 'en_revision'; un cerrado queda congelado; y re-aprobar conserva la PRIMERA fecha de publicación
-- (así una re-aprobación no vuelve a disparar alertas por correo).

create or replace function public.guard_deal_status() returns trigger
language plpgsql security definer set search_path = public as $$
declare material boolean;
begin
  if auth.uid() is null or public.is_admin() then
    -- published_at = primera publicación: se conserva si el deal ya se había publicado antes
    if new.status = 'publicado' and old.status is distinct from 'publicado' then
      new.published_at := coalesce(old.published_at, now());
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status not in ('borrador', 'en_revision') then
      raise exception 'Estado inicial no permitido: %', new.status;
    end if;
    new.seller_id := auth.uid();
    new.es_ejemplo := false;
    return new;
  end if;

  if new.seller_id is distinct from old.seller_id then raise exception 'No se puede cambiar el vendedor'; end if;
  if new.es_ejemplo is distinct from old.es_ejemplo then raise exception 'No autorizado'; end if;

  -- ¿Cambió algún campo material? (incluye la ubicación pública derivada: no se puede falsear en un deal publicado)
  material := (new.titulo, new.tipo_operacion, new.segmento, new.estado_clave, new.municipio_clave, new.colonia,
               new.lat_aprox, new.lng_aprox, new.precio, new.m2_terreno, new.m2_construccion, new.renta_mensual_actual,
               new.noi_anual, new.ocupacion_pct, new.num_inquilinos, new.plazo_promedio_contratos, new.regimen_propiedad,
               new.uso_suelo, new.zona_restringida, new.monto_capital_buscado, new.participacion_ofrecida_pct,
               new.tir_proyectada, new.descripcion_teaser)
              is distinct from
              (old.titulo, old.tipo_operacion, old.segmento, old.estado_clave, old.municipio_clave, old.colonia,
               old.lat_aprox, old.lng_aprox, old.precio, old.m2_terreno, old.m2_construccion, old.renta_mensual_actual,
               old.noi_anual, old.ocupacion_pct, old.num_inquilinos, old.plazo_promedio_contratos, old.regimen_propiedad,
               old.uso_suelo, old.zona_restringida, old.monto_capital_buscado, old.participacion_ofrecida_pct,
               old.tir_proyectada, old.descripcion_teaser);
  if material then
    if old.status = 'cerrado' then raise exception 'Un deal cerrado no se edita'; end if;
    if old.status in ('publicado', 'en_negociacion') then new.status := 'en_revision'; end if;
  end if;

  if new.status is distinct from old.status then
    if not (
      (old.status in ('borrador','en_revision') and new.status in ('borrador','en_revision')) or
      -- publicado/en_negociacion: además puede retirarse a revisión (no puede volver a publicar por sí solo)
      (old.status in ('publicado','en_negociacion') and new.status in ('publicado','en_negociacion','cerrado','en_revision'))
    ) then
      raise exception 'Transición de estado no permitida: % -> %', old.status, new.status;
    end if;
  end if;
  new.motivo_rechazo := old.motivo_rechazo;
  new.published_at := old.published_at;
  return new;
end $$;

-- Cambiar los datos privados (dirección, coordenadas, descripción completa) de un deal publicado también reabre la revisión.
-- Un UPDATE que no cambia nada (p. ej. el wizard de edición guardando sin tocar esos campos) NO la reabre.
create or replace function public.reabrir_revision_por_privado() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  if tg_op = 'UPDATE'
     and (new.direccion_exacta, new.lat, new.lng, new.descripcion_completa)
         is not distinct from (old.direccion_exacta, old.lat, old.lng, old.descripcion_completa) then
    return new;
  end if;
  update deals set status = 'en_revision' where id = new.deal_id and status in ('publicado', 'en_negociacion');
  return new;
end $$;

create trigger deal_private_revision after insert or update on deal_private
  for each row execute function public.reabrir_revision_por_privado();
