-- Ventas (facturas emitidas) descargadas del Registro de Compra y Venta (RCV)
-- del SII. Espejo de compras_sii pero la contraparte es el cliente. Clave
-- natural: tipo de documento + RUT del cliente + folio.

create table ventas_sii (
  id uuid primary key default gen_random_uuid(),
  periodo text not null,                 -- 'AAAAMM'
  tipo_doc integer not null,             -- 33 factura afecta, 34 exenta, 61 NC, etc.
  rut_cliente text not null,             -- '76109779-2'
  razon_social text,
  folio text not null,                   -- folio de la factura electrónica del SII
  fecha_emision date,
  fecha_recepcion date,
  monto_exento integer not null default 0,
  monto_neto integer not null default 0,
  monto_iva integer not null default 0,
  monto_total integer not null default 0,
  estado_contab text not null default 'REGISTRO',
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tipo_doc, rut_cliente, folio)
);

create index ventas_sii_periodo_idx on ventas_sii (periodo);

alter table ventas_sii enable row level security;
create policy "auth all ventas_sii" on ventas_sii
  for all to authenticated using (true) with check (true);

-- Vínculo nota de venta -> factura de venta del SII. Una nota se asocia a lo
-- más a una factura; on delete set null para no perder la nota si se re-baja la
-- factura. El índice único evita que dos notas apunten a la misma factura.
alter table notas_venta
  add column venta_sii_id uuid references ventas_sii(id) on delete set null;

create unique index notas_venta_venta_sii_id_key
  on notas_venta (venta_sii_id)
  where venta_sii_id is not null;
