-- DealMX · 0006 · NDA (vista del vendedor), analítica de vistas con deduplicación y Realtime del chat

-- Solicitantes de NDA de un deal con datos MÍNIMOS del perfil (sin teléfono ni registro).
-- Se usa una función en vez de abrir `profiles` al vendedor: RLS filtra filas, no columnas.
create or replace function public.solicitantes_nda(p_deal uuid)
returns table (nda_id uuid, user_id uuid, nombre text, empresa text, estado nda_estado,
               firma_nombre text, firmado_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_deal_owner(p_deal) or public.is_admin()) then
    raise exception 'No autorizado';
  end if;
  return query
    select n.id, n.user_id, p.nombre, p.empresa, n.estado, n.firma_nombre, n.firmado_at
    from ndas n join profiles p on p.id = n.user_id
    where n.deal_id = p_deal
    order by n.created_at desc;
end $$;

-- Analítica para el vendedor: totales y quién vio (solo usuarios identificados; nombre y empresa).
create or replace function public.vistas_deal(p_deal uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_deal_owner(p_deal) or public.is_admin()) then
    raise exception 'No autorizado';
  end if;
  return jsonb_build_object(
    'total',    (select count(*) from deal_views where deal_id = p_deal),
    'ult7',     (select count(*) from deal_views where deal_id = p_deal and viewed_at > now() - interval '7 days'),
    'ult30',    (select count(*) from deal_views where deal_id = p_deal and viewed_at > now() - interval '30 days'),
    'anonimas', (select count(*) from deal_views where deal_id = p_deal and viewer_id is null),
    'identificados', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.ultima desc) from (
        select v.viewer_id as user_id, p.nombre, p.empresa, count(*) as vistas, max(v.viewed_at) as ultima
        from deal_views v join profiles p on p.id = v.viewer_id
        where v.deal_id = p_deal
        group by v.viewer_id, p.nombre, p.empresa
        order by max(v.viewed_at) desc limit 50) x
    ), '[]'::jsonb)
  );
end $$;

revoke all on function public.solicitantes_nda(uuid) from public, anon;
revoke all on function public.vistas_deal(uuid) from public, anon;
grant execute on function public.solicitantes_nda(uuid) to authenticated;
grant execute on function public.vistas_deal(uuid) to authenticated;

-- Una vista por usuario identificado cada 30 minutos (evita inflar cifras al recargar).
create or replace function public.record_deal_view(p_deal uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from deals where id = p_deal and status in ('publicado','en_negociacion','cerrado'))
     or public.is_deal_owner(p_deal) then
    return;
  end if;
  if auth.uid() is not null and exists (
    select 1 from deal_views where deal_id = p_deal and viewer_id = auth.uid() and viewed_at > now() - interval '30 minutes'
  ) then
    return;
  end if;
  insert into deal_views (deal_id, viewer_id) values (p_deal, auth.uid());
end $$;

-- Realtime para el chat (la entrega respeta la RLS de messages).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;
