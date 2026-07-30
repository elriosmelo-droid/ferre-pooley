-- Forma de pago de cada compra: dato PROPIO, cargado a mano. El RCV del SII no
-- informa cómo se pagó el documento, así que no se puede derivar del sync.
--
-- Es opcional (null = sin asignar) y NO la toca el sync: `sincronizarCompras`
-- upserta solo las columnas del RCV, y un ON CONFLICT DO UPDATE no modifica las
-- columnas que no están en el payload, así que el valor manual sobrevive a las
-- corridas del cron.
--
-- Ojo: es distinto de `estado_contab`, que sí viene del SII (estado contable
-- del documento). Esto es cómo se pagó.
create type forma_pago_compra as enum (
  'contado', 'transferencia', 'credito', 'debito', 'otro'
);

alter table compras_sii
  add column if not exists forma_pago forma_pago_compra;

-- Filtrar por forma de pago es el caso de uso principal, y las compras sin
-- asignar son las que hay que ir a completar.
create index if not exists compras_sii_forma_pago_idx
  on compras_sii (forma_pago);
