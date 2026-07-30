-- Monto por forma de pago: cuando una compra se paga con más de un medio hace
-- falta saber cuánto fue con cada uno.
--
-- Forma y monto viven en UNA sola columna jsonb, no en dos columnas paralelas:
-- son un mismo hecho y separarlos permitiría que se desincronicen.
--   [{"forma": "cheque", "monto": 50000}, {"forma": "debito", "monto": 30000}]
-- `monto` puede ser null: con una sola forma de pago el monto es el total del
-- documento y no hace falta escribirlo.
--
-- La columna `forma_pago` NO se borra acá a propósito: el código que está en
-- producción todavía la lee, y borrarla antes de desplegar el nuevo dejaría
-- /compras caído en la ventana entre la migración y el deploy. Queda como
-- respaldo y se limpia en una migración posterior.
alter table compras_sii
  add column if not exists formas_pago jsonb;

-- Copia lo ya cargado a mano: cada forma pasa a un objeto con monto sin indicar.
update compras_sii
set formas_pago = (
  select jsonb_agg(jsonb_build_object('forma', f, 'monto', null))
  from unnest(forma_pago) as f
)
where forma_pago is not null
  and array_length(forma_pago, 1) > 0
  and formas_pago is null;

-- GIN para consultas de pertenencia sobre el jsonb.
create index if not exists compras_sii_formas_pago_idx
  on compras_sii using gin (formas_pago);
