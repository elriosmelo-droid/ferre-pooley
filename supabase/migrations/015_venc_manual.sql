-- Override manual del vencimiento de una factura, editable desde el estado de
-- cuenta (para darle más días a un cliente). Si está seteado, gana sobre el
-- vencimiento calculado (emisión + plazo).
alter table ventas_sii
  add column if not exists fecha_vencimiento_manual date;
