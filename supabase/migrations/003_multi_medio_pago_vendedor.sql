-- Medio de pago pasa a ser MÚLTIPLE (arreglo de enum) + vendedor en la cotización.
-- Aplicar a producción vía Node `pg` con conexión DIRECTA.

-- Convierte el valor único existente en un arreglo de un elemento (o null).
alter table cotizaciones
  alter column medio_pago type medio_pago[]
  using (case when medio_pago is null then null else array[medio_pago] end);
alter table notas_venta
  alter column medio_pago type medio_pago[]
  using (case when medio_pago is null then null else array[medio_pago] end);

-- Vendedor: nombre de quien generó la cotización (snapshot al crearla).
alter table cotizaciones add column vendedor text;
