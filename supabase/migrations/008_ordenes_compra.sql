-- Órdenes de compra internas (Tulbless → proveedor). NO es un DTE del SII: es un
-- documento propio que se envía al proveedor por correo (PDF adjunto). El folio
-- es correlativo OC-####. El precio de cada ítem se escribe a mano (precio de
-- compra), neto + IVA 19% + total. Cuando llegue la factura del SII se podrá
-- vincular a la orden más adelante.

-- Correo del proveedor: necesario para enviarle la orden. Lo carga el usuario.
alter table proveedores add column if not exists correo text;

create sequence orden_compra_folio_seq;

create type orden_compra_estado as enum ('borrador', 'enviada', 'recibida', 'cerrada');

create table ordenes_compra (
  id uuid primary key default gen_random_uuid(),
  folio text not null unique
    default 'OC-' || lpad(nextval('orden_compra_folio_seq')::text, 4, '0'),
  proveedor_id uuid not null references proveedores(id),
  estado orden_compra_estado not null default 'borrador',
  comprador text,                       -- nombre del usuario que la crea
  subtotal_neto integer not null default 0,
  iva integer not null default 0,
  total integer not null default 0,
  notas text,
  enviada_at timestamptz,
  recibida_at timestamptz,
  created_at timestamptz not null default now()
);

create index ordenes_compra_proveedor_idx on ordenes_compra (proveedor_id);
create index ordenes_compra_estado_idx on ordenes_compra (estado);

create table orden_compra_items (
  id uuid primary key default gen_random_uuid(),
  orden_compra_id uuid not null references ordenes_compra(id) on delete cascade,
  producto_id uuid references productos(id),
  sku text not null default '',
  descripcion text not null,
  cantidad integer not null check (cantidad > 0),
  precio integer not null default 0,    -- precio de compra unitario (neto)
  posicion integer not null default 0
);

create index orden_compra_items_orden_idx on orden_compra_items (orden_compra_id);

alter table ordenes_compra enable row level security;
alter table orden_compra_items enable row level security;

create policy "auth all ordenes_compra" on ordenes_compra
  for all to authenticated using (true) with check (true);
create policy "auth all orden_compra_items" on orden_compra_items
  for all to authenticated using (true) with check (true);
