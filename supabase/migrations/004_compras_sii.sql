-- Compras (facturas recibidas) descargadas del Registro de Compra y Venta (RCV)
-- del SII. Las llena el sync horario (endpoint /api/sii/sync con service role).
-- Clave natural: tipo de documento + RUT del proveedor + folio. El upsert por
-- esa clave hace el sync idempotente (se puede correr cada hora sin duplicar).

create table compras_sii (
  id uuid primary key default gen_random_uuid(),
  periodo text not null,                 -- 'AAAAMM'
  tipo_doc integer not null,             -- 33 factura afecta, 34 exenta, 61 NC, etc.
  rut_proveedor text not null,           -- '12345678-9'
  razon_social text,
  folio text not null,
  fecha_emision date,
  fecha_recepcion date,
  monto_exento integer not null default 0,
  monto_neto integer not null default 0,
  monto_iva integer not null default 0,
  monto_total integer not null default 0,
  estado_contab text not null default 'REGISTRO',
  raw jsonb,                             -- fila cruda del SII por si falta algún campo
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tipo_doc, rut_proveedor, folio)
);

create index compras_sii_periodo_idx on compras_sii (periodo);

alter table compras_sii enable row level security;
create policy "auth all compras_sii" on compras_sii
  for all to authenticated using (true) with check (true);
