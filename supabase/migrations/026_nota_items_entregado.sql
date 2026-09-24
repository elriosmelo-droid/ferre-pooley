-- Entrega por ítem de nota de venta. Las notas que ya existían se dan por
-- entregadas (decisión del usuario); las nuevas parten sin entregar.

begin;

alter table nota_venta_items
  add column if not exists entregado boolean not null default false,
  add column if not exists entregado_at timestamptz;

update nota_venta_items
set entregado = true, entregado_at = now()
where entregado = false;

commit;
