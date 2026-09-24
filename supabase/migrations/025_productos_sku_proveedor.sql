-- Productos: SKU del proveedor (match 1 a 1 con el SKU propio), marca,
-- unidad de medida y proveedor habitual. Borrar un producto no toca los
-- documentos: los ítems guardan copia de SKU/descripción y solo pierden el
-- vínculo (producto_id queda null).

begin;

alter table productos
  add column if not exists sku_proveedor text unique,
  add column if not exists marca text,
  add column if not exists unidad text,
  add column if not exists proveedor_id uuid references proveedores(id) on delete set null;

create index if not exists productos_proveedor_id_idx on productos (proveedor_id);

alter table cotizacion_items
  drop constraint if exists cotizacion_items_producto_id_fkey,
  add constraint cotizacion_items_producto_id_fkey
    foreign key (producto_id) references productos(id) on delete set null;

alter table orden_compra_items
  drop constraint if exists orden_compra_items_producto_id_fkey,
  add constraint orden_compra_items_producto_id_fkey
    foreign key (producto_id) references productos(id) on delete set null;

commit;
