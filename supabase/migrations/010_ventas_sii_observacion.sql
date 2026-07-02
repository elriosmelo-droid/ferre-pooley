-- 010: Observación por documento vinculado a una nota de venta. Uso típico:
-- una nota de crédito asociada a la nota deja constancia de qué factura
-- descuenta ("Descuenta factura 123").
alter table ventas_sii add column observacion text;
