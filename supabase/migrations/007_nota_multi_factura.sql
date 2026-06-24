-- Una nota de venta puede agrupar varias facturas del SII (mercadería + flete
-- facturado aparte). Se invierte el vínculo: ahora vive en ventas_sii
-- (nota_venta_id), de modo que una nota tenga 0..N facturas y cada factura
-- pertenezca a lo más a una nota.

alter table ventas_sii
  add column nota_venta_id uuid references notas_venta(id) on delete set null;

create index ventas_sii_nota_venta_id_idx on ventas_sii (nota_venta_id);

-- Migra los vínculos 1:1 existentes (si los hubiera) al nuevo modelo.
update ventas_sii v
set nota_venta_id = n.id
from notas_venta n
where n.venta_sii_id = v.id;

-- Elimina el vínculo 1:1 anterior (el índice único parcial se borra con la
-- columna).
alter table notas_venta drop column venta_sii_id;
