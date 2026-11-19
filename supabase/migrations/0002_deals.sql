-- DealMX · 0002 · deals (público) y deal_private (privado, requiere NDA)

create table deals (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references profiles(id) on delete cascade,
  titulo text not null check (char_length(titulo) between 5 and 160),
  tipo_operacion tipo_operacion not null,
  segmento segmento not null,
  estado_clave text not null references inegi_estados(clave),
  municipio_clave text not null,
  colonia text,
  -- Coordenadas APROXIMADAS (públicas). Se derivan en BD desde deal_private; nunca las envía el cliente.
  lat_aprox numeric(8,5),
  lng_aprox numeric(8,5),
  precio numeric(16,2) check (precio > 0),
  m2_terreno numeric(12,2) check (m2_terreno >= 0),
  m2_construccion numeric(12,2) check (m2_construccion >= 0),
  renta_mensual_actual numeric(14,2) check (renta_mensual_actual >= 0),
  noi_anual numeric(16,2),
  ocupacion_pct numeric(5,2) check (ocupacion_pct between 0 and 100),
  num_inquilinos int check (num_inquilinos >= 0),
  plazo_promedio_contratos numeric(5,1) check (plazo_promedio_contratos >= 0), -- años
  regimen_propiedad regimen_propiedad,
  uso_suelo text,
  zona_restringida boolean not null default false,
  monto_capital_buscado numeric(16,2) check (monto_capital_buscado >= 0),
  participacion_ofrecida_pct numeric(5,2) check (participacion_ofrecida_pct between 0 and 100),
  tir_proyectada numeric(5,2),
  descripcion_teaser text not null default '',
  status deal_status not null default 'borrador',
  motivo_rechazo text,
  es_ejemplo boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Campos calculados
  cap_rate numeric(8,4) generated always as (noi_anual / nullif(precio, 0)) stored,
  precio_m2 numeric(14,2) generated always as (precio / nullif(coalesce(m2_construccion, m2_terreno), 0)) stored,
  foreign key (estado_clave, municipio_clave) references inegi_municipios(estado_clave, clave)
);

create index deals_search_idx on deals (status, segmento, estado_clave, municipio_clave);
create index deals_precio_idx on deals (precio);
create index deals_cap_rate_idx on deals (cap_rate);
create index deals_seller_idx on deals (seller_id);
create index deals_published_idx on deals (published_at desc);

-- Campos que SOLO se ven con NDA aprobado (RLS filtra filas, por eso es tabla aparte)
create table deal_private (
  deal_id uuid primary key references deals(id) on delete cascade,
  direccion_exacta text,
  lat numeric(9,6),
  lng numeric(9,6),
  descripcion_completa text
);

create table deal_photos (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals(id) on delete cascade,
  path text not null,           -- ruta en bucket público deal-photos
  orden int not null default 0
);

create table deal_documents (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals(id) on delete cascade,
  storage_path text not null,   -- ruta en bucket privado data-room: {deal_id}/{archivo}
  nombre text not null,
  tipo text,
  created_at timestamptz not null default now()
);

-- updated_at
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger deals_touch before update on deals for each row execute function public.touch_updated_at();

-- Control de estados: el vendedor solo mueve borrador<->en_revision y (si ya publicado) en_negociacion/cerrado.
-- Solo admin publica. El service role (auth.uid() null) no tiene restricción.
create or replace function public.guard_deal_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then
    if new.status = 'publicado' and old.status is distinct from 'publicado' then new.published_at := now(); end if;
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
  if new.status is distinct from old.status then
    if not (
      (old.status in ('borrador','en_revision') and new.status in ('borrador','en_revision')) or
      (old.status in ('publicado','en_negociacion') and new.status in ('publicado','en_negociacion','cerrado'))
    ) then
      raise exception 'Transición de estado no permitida: % -> %', old.status, new.status;
    end if;
  end if;
  new.motivo_rechazo := old.motivo_rechazo;
  new.published_at := old.published_at;
  return new;
end $$;
create trigger deals_status_guard before insert or update on deals
  for each row execute function public.guard_deal_status();

-- Coordenadas aproximadas: se calculan en BD a partir de las exactas.
-- Redondeo a 2 decimales (~1.1 km) + desplazamiento determinista por deal (hasta ~0.4 km),
-- de modo que no se pueda recuperar la posición exacta del redondeo.
create or replace function public.compute_approx_coords() returns trigger
language plpgsql security definer set search_path = public as $$
declare h1 numeric; h2 numeric;
begin
  if new.lat is not null and new.lng is not null then
    h1 := ((('x' || substr(md5(new.deal_id::text || 'a'), 1, 6))::bit(24)::int) % 1000) / 1000.0 - 0.5; -- -0.5..0.5
    h2 := ((('x' || substr(md5(new.deal_id::text || 'b'), 1, 6))::bit(24)::int) % 1000) / 1000.0 - 0.5;
    update deals set
      lat_aprox = round(new.lat, 2) + h1 * 0.007,
      lng_aprox = round(new.lng, 2) + h2 * 0.007
    where id = new.deal_id;
  end if;
  return new;
end $$;
create trigger deal_private_approx after insert or update of lat, lng on deal_private
  for each row execute function public.compute_approx_coords();

-- NDA aprobado => acceso a datos privados. Definida aquí con referencia tardía a ndas (0003).
create table ndas (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  estado nda_estado not null default 'solicitado',
  template_version int,
  texto_snapshot text,
  firma_nombre text,
  firmado_at timestamptz,
  firma_ip inet,
  resuelto_por uuid references profiles(id),
  resuelto_at timestamptz,
  created_at timestamptz not null default now(),
  unique (deal_id, user_id)
);
create index ndas_deal_idx on ndas (deal_id, estado);

create or replace function public.is_deal_owner(p_deal uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from deals where id = p_deal and seller_id = auth.uid());
$$;

create or replace function public.has_approved_nda(p_deal uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from ndas where deal_id = p_deal and user_id = auth.uid() and estado = 'aprobado');
$$;

create or replace function public.can_see_private(p_deal uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or public.is_deal_owner(p_deal) or public.has_approved_nda(p_deal);
$$;

alter table deals enable row level security;
alter table deal_private enable row level security;
alter table deal_photos enable row level security;
alter table deal_documents enable row level security;
alter table ndas enable row level security;

-- deals
create policy "deals publicos" on deals for select
  using (status in ('publicado', 'en_negociacion', 'cerrado') or seller_id = auth.uid() or public.is_admin());
create policy "deals insert vendedor" on deals for insert to authenticated
  with check (seller_id = auth.uid()
    and exists (select 1 from profiles where id = auth.uid() and rol in ('vendedor','admin')));
create policy "deals update dueno" on deals for update to authenticated
  using (seller_id = auth.uid() or public.is_admin())
  with check (seller_id = auth.uid() or public.is_admin());
create policy "deals delete dueno" on deals for delete to authenticated
  using ((seller_id = auth.uid() and status in ('borrador','en_revision')) or public.is_admin());

-- deal_private: lectura solo con can_see_private; escritura solo dueño/admin
create policy "private lectura" on deal_private for select to authenticated using (public.can_see_private(deal_id));
create policy "private insert" on deal_private for insert to authenticated
  with check (public.is_deal_owner(deal_id) or public.is_admin());
create policy "private update" on deal_private for update to authenticated
  using (public.is_deal_owner(deal_id) or public.is_admin())
  with check (public.is_deal_owner(deal_id) or public.is_admin());
create policy "private delete" on deal_private for delete to authenticated
  using (public.is_deal_owner(deal_id) or public.is_admin());

-- fotos: públicas si el deal es visible (la subquery respeta la RLS de deals)
create policy "fotos lectura" on deal_photos for select
  using (exists (select 1 from deals d where d.id = deal_id));
create policy "fotos escritura" on deal_photos for all to authenticated
  using (public.is_deal_owner(deal_id) or public.is_admin())
  with check (public.is_deal_owner(deal_id) or public.is_admin());

-- documentos del data room
create policy "docs lectura" on deal_documents for select to authenticated using (public.can_see_private(deal_id));
create policy "docs escritura" on deal_documents for all to authenticated
  using (public.is_deal_owner(deal_id) or public.is_admin())
  with check (public.is_deal_owner(deal_id) or public.is_admin());

-- ndas
create policy "nda lectura" on ndas for select to authenticated
  using (user_id = auth.uid() or public.is_deal_owner(deal_id) or public.is_admin());
-- El inversionista solo puede crear su solicitud en estado 'solicitado' sobre deals visibles.
create policy "nda insert" on ndas for insert to authenticated
  with check (user_id = auth.uid() and estado = 'solicitado'
    and exists (select 1 from deals d where d.id = deal_id and d.status in ('publicado','en_negociacion')));
create policy "nda update" on ndas for update to authenticated
  using (user_id = auth.uid() or public.is_deal_owner(deal_id) or public.is_admin())
  with check (user_id = auth.uid() or public.is_deal_owner(deal_id) or public.is_admin());

-- Máquina de estados del NDA:
--   inversionista: solicitado -> firmado (con nombre de firma). Nada más.
--   dueño del deal / admin: firmado -> aprobado | rechazado.
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
      else
        raise exception 'Transición de NDA no permitida: % -> %', old.estado, new.estado;
      end if;
    end if;
    -- datos de firma inmutables desde el cliente (los escribe el route handler con service role)
    new.firma_nombre := old.firma_nombre; new.firmado_at := old.firmado_at; new.firma_ip := old.firma_ip;
    new.texto_snapshot := old.texto_snapshot; new.template_version := old.template_version;
  end if;
  return new;
end $$;
create trigger ndas_guard before update on ndas for each row execute function public.guard_nda_transition();
