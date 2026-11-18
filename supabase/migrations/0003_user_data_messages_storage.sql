-- DealMX · 0003 · plantillas NDA, búsquedas, favoritos, pipeline, mensajes, vistas, storage

create table nda_templates (
  version int primary key,
  texto text not null,
  activo boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index nda_templates_one_active on nda_templates (activo) where activo;
alter table nda_templates enable row level security;
create policy "nda_templates lectura" on nda_templates for select using (true);

insert into nda_templates (version, texto, activo) values (1,
'ACUERDO DE CONFIDENCIALIDAD (PLACEHOLDER – requiere revisión legal antes de producción). El firmante se obliga a mantener en estricta confidencialidad la información privada del inmueble u oportunidad (dirección exacta, documentos, cifras y descripción completa), a usarla únicamente para evaluar la operación y a no divulgarla a terceros sin autorización escrita del vendedor. DealMX no es parte de la operación ni asesor de inversiones.',
true);

create table saved_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  nombre text not null default 'Mi búsqueda',
  filtros jsonb not null default '{}'::jsonb,
  frecuencia alerta_frecuencia not null default 'diaria',
  activa boolean not null default true,
  last_sent_at timestamptz,
  created_at timestamptz not null default now()
);
create table favorites (
  user_id uuid not null references profiles(id) on delete cascade,
  deal_id uuid not null references deals(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, deal_id)
);
create table pipeline_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  deal_id uuid not null references deals(id) on delete cascade,
  etapa pipeline_etapa not null default 'visto',
  notas text,
  updated_at timestamptz not null default now(),
  unique (user_id, deal_id)
);
create trigger pipeline_touch before update on pipeline_items for each row execute function public.touch_updated_at();

alter table saved_searches enable row level security;
alter table favorites enable row level security;
alter table pipeline_items enable row level security;
create policy "searches propias" on saved_searches for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "favoritos propios" on favorites for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "pipeline propio" on pipeline_items for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Mensajes: un hilo por (deal, inversionista). Solo tras NDA aprobado.
create table messages (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals(id) on delete cascade,
  thread_user_id uuid not null references profiles(id) on delete cascade, -- el inversionista del hilo
  sender_id uuid not null references profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index messages_thread_idx on messages (deal_id, thread_user_id, created_at);
alter table messages enable row level security;

create or replace function public.nda_approved_for(p_deal uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from ndas where deal_id = p_deal and user_id = p_user and estado = 'aprobado');
$$;

create policy "mensajes lectura" on messages for select to authenticated
  using (
    (thread_user_id = auth.uid() and public.nda_approved_for(deal_id, auth.uid()))
    or (public.is_deal_owner(deal_id) and public.nda_approved_for(deal_id, thread_user_id))
  );
create policy "mensajes insert" on messages for insert to authenticated
  with check (
    sender_id = auth.uid() and (
      (thread_user_id = auth.uid() and public.nda_approved_for(deal_id, auth.uid()))
      or (public.is_deal_owner(deal_id) and public.nda_approved_for(deal_id, thread_user_id))
    )
  );

-- Analítica de vistas. Inserción solo por RPC (cuenta al usuario autenticado, anónimo si no hay sesión).
create table deal_views (
  id bigint generated always as identity primary key,
  deal_id uuid not null references deals(id) on delete cascade,
  viewer_id uuid references profiles(id) on delete set null,
  viewed_at timestamptz not null default now()
);
create index deal_views_deal_idx on deal_views (deal_id, viewed_at desc);
alter table deal_views enable row level security;
create policy "vistas lectura dueno" on deal_views for select to authenticated
  using (public.is_deal_owner(deal_id) or public.is_admin());

create or replace function public.record_deal_view(p_deal uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from deals where id = p_deal and status in ('publicado','en_negociacion','cerrado'))
     and not public.is_deal_owner(p_deal) then
    insert into deal_views (deal_id, viewer_id) values (p_deal, auth.uid());
  end if;
end $$;
grant execute on function public.record_deal_view(uuid) to anon, authenticated;

-- Perfil mínimo del vendedor visible en deals publicados (nombre, empresa, verificación).
-- Expuesto como vista para no abrir teléfono ni registro a anónimos.
create view public.seller_public as
  select p.id, p.nombre, p.empresa, p.estado_verificacion, p.registro_asesor, p.estado_registro
  from profiles p
  where exists (select 1 from deals d where d.seller_id = p.id and d.status in ('publicado','en_negociacion','cerrado'));
grant select on public.seller_public to anon, authenticated;

-- Storage -------------------------------------------------------------------
-- (en Supabase local/remoto los buckets viven en storage.buckets; este bloque se omite si no existe el esquema)
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public) values ('deal-photos', 'deal-photos', true) on conflict do nothing;
    insert into storage.buckets (id, name, public) values ('data-room', 'data-room', false) on conflict do nothing;

    -- Fotos: lectura pública; escritura solo dueño del deal (ruta {deal_id}/archivo)
    execute $p$create policy "fotos escritura dueno" on storage.objects for insert to authenticated
      with check (bucket_id = 'deal-photos' and public.is_deal_owner(((storage.foldername(name))[1])::uuid))$p$;
    execute $p$create policy "fotos borrado dueno" on storage.objects for delete to authenticated
      using (bucket_id = 'deal-photos' and public.is_deal_owner(((storage.foldername(name))[1])::uuid))$p$;

    -- Data room: lectura solo dueño/admin/NDA aprobado; escritura solo dueño
    execute $p$create policy "dataroom lectura" on storage.objects for select to authenticated
      using (bucket_id = 'data-room' and public.can_see_private(((storage.foldername(name))[1])::uuid))$p$;
    execute $p$create policy "dataroom escritura" on storage.objects for insert to authenticated
      with check (bucket_id = 'data-room' and public.is_deal_owner(((storage.foldername(name))[1])::uuid))$p$;
    execute $p$create policy "dataroom borrado" on storage.objects for delete to authenticated
      using (bucket_id = 'data-room' and public.is_deal_owner(((storage.foldername(name))[1])::uuid))$p$;
  end if;
end $$;
