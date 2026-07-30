-- Una compra puede pagarse con más de un medio a la vez (ej. cheque + débito),
-- así que `forma_pago` pasa de un valor a un arreglo. Se agrega también 'cheque',
-- que no estaba en la lista inicial.
--
-- Sigue siendo opcional: null = sin asignar.

-- En PG 12+ se puede agregar un valor al enum dentro de una transacción, siempre
-- que no se use en esa misma transacción. Acá solo se declara.
alter type forma_pago_compra add value if not exists 'cheque';

-- El índice btree del escalar no sirve para consultas de pertenencia sobre el
-- arreglo: se reemplaza por GIN.
drop index if exists compras_sii_forma_pago_idx;

-- La conversión envuelve cada valor existente en un arreglo de un elemento, así
-- que ninguna carga manual se pierde.
alter table compras_sii
  alter column forma_pago type forma_pago_compra[]
  using case
    when forma_pago is null then null
    else array[forma_pago]
  end;

create index if not exists compras_sii_forma_pago_idx
  on compras_sii using gin (forma_pago);
