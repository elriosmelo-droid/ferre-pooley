-- Plazo de pago y vencimiento de cada factura, tomados del DTE (no vienen en el
-- RCV). Se llenan con un precache que baja el DTE. `venc_procesado` marca las ya
-- procesadas; `venc_notificado_at` evita re-avisar a Victor por la misma factura.

alter table ventas_sii
  add column if not exists forma_pago integer,
  add column if not exists term_pago_dias integer,
  add column if not exists fecha_vencimiento date,
  add column if not exists venc_procesado boolean not null default false,
  add column if not exists venc_notificado_at timestamptz;

-- Facturas pendientes de procesar el vencimiento (para el precache).
create index if not exists ventas_sii_venc_procesado_idx
  on ventas_sii (venc_procesado)
  where venc_procesado = false;
