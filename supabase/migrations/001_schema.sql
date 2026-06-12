-- Ferre Pooley: esquema cotizaciones → notas de venta
-- Aplicar en Supabase: SQL Editor → pegar todo → Run

create table clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  rut text,
  correo text not null,
  telefono text,
  direccion text,
  created_at timestamptz not null default now()
);

create table productos (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  descripcion text not null,
  costo integer not null default 0,
  precio integer not null default 0,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create sequence cotizacion_folio_seq;
create sequence nota_venta_folio_seq;

create type cotizacion_estado as enum ('borrador','enviada','aceptada','rechazada','vencida');
create type nota_venta_estado as enum ('pendiente','pagada','anulada');

create table cotizaciones (
  id uuid primary key default gen_random_uuid(),
  folio text not null unique default 'COT-' || lpad(nextval('cotizacion_folio_seq')::text, 4, '0'),
  cliente_id uuid not null references clientes(id),
  estado cotizacion_estado not null default 'borrador',
  fecha_validez date not null default (current_date + 30),
  flete integer not null default 0,
  subtotal_neto integer not null default 0,
  iva integer not null default 0,
  total integer not null default 0,
  token_aceptacion uuid not null unique default gen_random_uuid(),
  notas text,
  enviada_at timestamptz,
  respondida_at timestamptz,
  created_at timestamptz not null default now()
);

create table cotizacion_items (
  id uuid primary key default gen_random_uuid(),
  cotizacion_id uuid not null references cotizaciones(id) on delete cascade,
  producto_id uuid references productos(id),
  sku text not null default '',
  descripcion text not null,
  cantidad integer not null check (cantidad > 0),
  costo integer not null default 0,
  precio integer not null default 0,
  posicion integer not null default 0
);

create table notas_venta (
  id uuid primary key default gen_random_uuid(),
  folio text not null unique default 'NV-' || lpad(nextval('nota_venta_folio_seq')::text, 4, '0'),
  cotizacion_id uuid not null unique references cotizaciones(id),
  cliente_id uuid not null references clientes(id),
  estado nota_venta_estado not null default 'pendiente',
  flete integer not null default 0,
  subtotal_neto integer not null default 0,
  iva integer not null default 0,
  total integer not null default 0,
  pagada_at timestamptz,
  created_at timestamptz not null default now()
);

create table nota_venta_items (
  id uuid primary key default gen_random_uuid(),
  nota_venta_id uuid not null references notas_venta(id) on delete cascade,
  sku text not null default '',
  descripcion text not null,
  cantidad integer not null,
  costo integer not null default 0,
  precio integer not null default 0,
  posicion integer not null default 0
);

create table perfiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nombre text,
  razon_social text,
  rut_empresa text,
  direccion_empresa text,
  telefono_empresa text,
  correo_aviso text,
  created_at timestamptz not null default now()
);

-- RLS: todo requiere usuario autenticado; el flujo público usa service role
alter table clientes enable row level security;
alter table productos enable row level security;
alter table cotizaciones enable row level security;
alter table cotizacion_items enable row level security;
alter table notas_venta enable row level security;
alter table nota_venta_items enable row level security;
alter table perfiles enable row level security;

create policy "auth all clientes" on clientes for all to authenticated using (true) with check (true);
create policy "auth all productos" on productos for all to authenticated using (true) with check (true);
create policy "auth all cotizaciones" on cotizaciones for all to authenticated using (true) with check (true);
create policy "auth all cotizacion_items" on cotizacion_items for all to authenticated using (true) with check (true);
create policy "auth all notas_venta" on notas_venta for all to authenticated using (true) with check (true);
create policy "auth all nota_venta_items" on nota_venta_items for all to authenticated using (true) with check (true);
create policy "own perfil" on perfiles for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Aceptación atómica: solo gana la primera transición desde 'enviada'.
-- Crea la nota de venta con snapshot de ítems en la misma transacción.
create or replace function responder_cotizacion(p_token uuid, p_aceptar boolean)
returns table (resultado text, nota_venta_folio text)
language plpgsql security definer set search_path = public as $$
declare
  v_cot cotizaciones%rowtype;
  v_nv notas_venta%rowtype;
begin
  select * into v_cot from cotizaciones where token_aceptacion = p_token for update;
  if not found then
    return query select 'no_existe'::text, null::text; return;
  end if;
  if v_cot.estado <> 'enviada' then
    return query select v_cot.estado::text, null::text; return;
  end if;
  if v_cot.fecha_validez < current_date then
    update cotizaciones set estado = 'vencida' where id = v_cot.id;
    return query select 'vencida'::text, null::text; return;
  end if;
  if p_aceptar then
    update cotizaciones set estado = 'aceptada', respondida_at = now() where id = v_cot.id;
    insert into notas_venta (cotizacion_id, cliente_id, flete, subtotal_neto, iva, total)
      values (v_cot.id, v_cot.cliente_id, v_cot.flete, v_cot.subtotal_neto, v_cot.iva, v_cot.total)
      returning * into v_nv;
    insert into nota_venta_items (nota_venta_id, sku, descripcion, cantidad, costo, precio, posicion)
      select v_nv.id, sku, descripcion, cantidad, costo, precio, posicion
      from cotizacion_items where cotizacion_id = v_cot.id;
    return query select 'aceptada'::text, v_nv.folio;
  else
    update cotizaciones set estado = 'rechazada', respondida_at = now() where id = v_cot.id;
    return query select 'rechazada'::text, null::text;
  end if;
end $$;

revoke execute on function responder_cotizacion(uuid, boolean) from public, anon, authenticated;
