-- DealMX · 0001 · enums, profiles y catálogos INEGI
create extension if not exists pgcrypto;

create type rol_usuario as enum ('inversionista', 'vendedor', 'admin');
create type estado_verificacion as enum ('pendiente', 'verificado', 'rechazado');
create type tipo_operacion as enum ('venta', 'busca_socio_capital', 'remate', 'negocio_con_inmueble');
create type segmento as enum ('industrial', 'comercial', 'oficinas', 'multifamiliar', 'hotelero', 'terreno', 'mixto');
create type regimen_propiedad as enum ('escritura', 'ejido', 'fideicomiso', 'condominio');
create type deal_status as enum ('borrador', 'en_revision', 'publicado', 'en_negociacion', 'cerrado');
create type nda_estado as enum ('solicitado', 'firmado', 'aprobado', 'rechazado');
create type pipeline_etapa as enum ('visto', 'nda', 'oferta', 'due_diligence', 'cierre', 'descartado');
create type alerta_frecuencia as enum ('diaria', 'semanal');

-- Catálogos INEGI (lectura pública)
create table inegi_estados (
  clave text primary key check (clave ~ '^[0-9]{2}$'),
  nombre text not null
);
create table inegi_municipios (
  estado_clave text not null references inegi_estados(clave),
  clave text not null check (clave ~ '^[0-9]{3}$'),
  nombre text not null,
  primary key (estado_clave, clave)
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  rol rol_usuario not null default 'inversionista',
  nombre text not null default '',
  empresa text,
  telefono text,
  estado_verificacion estado_verificacion not null default 'pendiente',
  registro_asesor text,          -- opcional: número de registro estatal de asesor inmobiliario
  estado_registro text,          -- estado (INEGI) que emitió el registro
  created_at timestamptz not null default now()
);

-- Helpers de rol. SECURITY DEFINER para evitar recursión de RLS sobre profiles.
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and rol = 'admin');
$$;

-- Alta de perfil al registrarse. Solo permite inversionista|vendedor desde metadata; admin jamás.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare r rol_usuario;
begin
  r := case when new.raw_user_meta_data->>'rol' = 'vendedor' then 'vendedor'::rol_usuario
            else 'inversionista'::rol_usuario end;
  insert into profiles (id, rol, nombre, empresa, telefono)
  values (new.id, r,
          coalesce(new.raw_user_meta_data->>'nombre', ''),
          new.raw_user_meta_data->>'empresa',
          new.raw_user_meta_data->>'telefono');
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Un usuario no puede escalar su rol ni auto-verificarse (solo admin / service role).
create or replace function public.guard_profile_privileged_cols() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.rol is distinct from old.rol
       or new.estado_verificacion is distinct from old.estado_verificacion then
      raise exception 'No autorizado para modificar rol o verificación';
    end if;
  end if;
  return new;
end $$;

create trigger profiles_guard before update on profiles
  for each row execute function public.guard_profile_privileged_cols();

alter table profiles enable row level security;
alter table inegi_estados enable row level security;
alter table inegi_municipios enable row level security;

create policy "catalogo estados lectura" on inegi_estados for select using (true);
create policy "catalogo municipios lectura" on inegi_municipios for select using (true);

create policy "perfil propio lectura" on profiles for select using (id = auth.uid() or public.is_admin());
create policy "perfil propio actualiza" on profiles for update using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());
-- (el insert lo hace el trigger handle_new_user; la lectura de perfil mínimo del vendedor se agrega en 0003)
