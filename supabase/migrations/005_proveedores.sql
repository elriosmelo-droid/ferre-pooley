-- Proveedores derivados de las compras del SII. La clave natural es el RUT.
-- Se siembran desde compras_sii y el sync los mantiene al día (sin pisar el
-- `tipo` que asigna el usuario). `tipo` es clasificación manual filtrable.

create table proveedores (
  id uuid primary key default gen_random_uuid(),
  rut text not null unique,                 -- '76109779-2'
  razon_social text,
  tipo text check (tipo in ('combustibles', 'transporte', 'materiales')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index proveedores_tipo_idx on proveedores (tipo);

-- Seed inicial: un proveedor por RUT existente en compras_sii, tomando la razón
-- social más reciente. tipo queda null (sin clasificar) para asignar después.
insert into proveedores (rut, razon_social)
select distinct on (rut_proveedor) rut_proveedor, razon_social
from compras_sii
order by rut_proveedor, updated_at desc
on conflict (rut) do nothing;

alter table proveedores enable row level security;
create policy "auth all proveedores" on proveedores
  for all to authenticated using (true) with check (true);
