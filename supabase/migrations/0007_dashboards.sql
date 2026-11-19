-- DealMX · 0007 · dashboards: pipeline ligado al NDA y funciones de resumen para el vendedor

alter table pipeline_items add constraint pipeline_notas_len check (notas is null or char_length(notas) <= 2000);

-- Al firmar/aprobarse un NDA el deal avanza a la etapa 'nda' del pipeline del inversionista,
-- pero solo si no existe o sigue en 'visto' (no pisa 'oferta', 'due_diligence', 'cierre' ni 'descartado').
create or replace function public.sync_pipeline_from_nda() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.estado in ('firmado', 'aprobado') and (tg_op = 'INSERT' or new.estado is distinct from old.estado) then
    insert into pipeline_items (user_id, deal_id, etapa) values (new.user_id, new.deal_id, 'nda')
    on conflict (user_id, deal_id) do update set etapa = 'nda' where pipeline_items.etapa = 'visto';
  end if;
  return new;
end $$;
create trigger ndas_pipeline after insert or update of estado on ndas
  for each row execute function public.sync_pipeline_from_nda();

-- Todas las funciones acotan por auth.uid() (no reciben el vendedor como parámetro) y no exponen
-- teléfono ni correo del inversionista.

-- Estadísticas por cada deal del vendedor autenticado.
create or replace function public.deals_vendedor_stats()
returns table (deal_id uuid, vistas_total bigint, vistas_7d bigint, ndas_pendientes bigint, ndas_aprobados bigint, mensajes bigint)
language sql stable security definer set search_path = public as $$
  select d.id,
    (select count(*) from deal_views v where v.deal_id = d.id),
    (select count(*) from deal_views v where v.deal_id = d.id and v.viewed_at > now() - interval '7 days'),
    (select count(*) from ndas n where n.deal_id = d.id and n.estado = 'firmado'),
    (select count(*) from ndas n where n.deal_id = d.id and n.estado = 'aprobado'),
    (select count(*) from messages m where m.deal_id = d.id)
  from deals d where d.seller_id = auth.uid();
$$;

-- NDAs firmados que esperan decisión, de todos los deals del vendedor.
create or replace function public.solicitudes_pendientes_vendedor()
returns table (nda_id uuid, deal_id uuid, titulo text, user_id uuid, nombre text, empresa text, firma_nombre text, firmado_at timestamptz)
language sql stable security definer set search_path = public as $$
  select n.id, d.id, d.titulo, n.user_id, p.nombre, p.empresa, n.firma_nombre, n.firmado_at
  from ndas n
  join deals d on d.id = n.deal_id and d.seller_id = auth.uid()
  join profiles p on p.id = n.user_id
  where n.estado = 'firmado'
  order by n.firmado_at desc nulls last
  limit 200;
$$;

-- Hilos de chat de los deals del vendedor, con el último mensaje.
create or replace function public.hilos_vendedor()
returns table (deal_id uuid, titulo text, thread_user_id uuid, nombre text, empresa text, ultimo_body text, ultimo_sender uuid, ultimo_at timestamptz, total bigint)
language sql stable security definer set search_path = public as $$
  select d.id, d.titulo, g.thread_user_id, p.nombre, p.empresa, l.body, l.sender_id, l.created_at, g.total
  from (select m.deal_id, m.thread_user_id, count(*) as total from messages m group by 1, 2) g
  join deals d on d.id = g.deal_id and d.seller_id = auth.uid()
  join profiles p on p.id = g.thread_user_id
  cross join lateral (
    select left(x.body, 200) as body, x.sender_id, x.created_at from messages x
    where x.deal_id = g.deal_id and x.thread_user_id = g.thread_user_id order by x.created_at desc limit 1
  ) l
  order by l.created_at desc
  limit 100;
$$;

revoke all on function public.deals_vendedor_stats() from public, anon;
revoke all on function public.solicitudes_pendientes_vendedor() from public, anon;
revoke all on function public.hilos_vendedor() from public, anon;
grant execute on function public.deals_vendedor_stats() to authenticated;
grant execute on function public.solicitudes_pendientes_vendedor() to authenticated;
grant execute on function public.hilos_vendedor() to authenticated;
