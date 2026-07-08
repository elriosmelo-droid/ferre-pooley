-- Observación obligatoria al cerrar una orden de compra. Se exige en la app;
-- la columna es nullable porque las órdenes ya cerradas antes de este cambio no
-- la tienen. `cerrada_at` registra cuándo se cerró.

alter table ordenes_compra
  add column if not exists observacion_cierre text,
  add column if not exists cerrada_at timestamptz;
