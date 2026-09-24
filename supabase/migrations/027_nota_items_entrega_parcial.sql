-- Entrega parcial: cada ítem guarda cuánto se entregó (0..cantidad).
-- «entregado» pasa a ser derivado (todo entregado). entregado_at = fecha del
-- último cambio de entrega.

begin;

alter table nota_venta_items
  add column if not exists cantidad_entregada integer not null default 0
    check (cantidad_entregada >= 0);

update nota_venta_items
set cantidad_entregada = greatest(cantidad, 0)
where entregado;

alter table nota_venta_items drop column entregado;
alter table nota_venta_items
  add column entregado boolean generated always as (cantidad_entregada >= cantidad) stored;

commit;
