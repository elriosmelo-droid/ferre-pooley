-- Plazo de pago de la orden de compra (texto libre: "30 días", "Contado",
-- "Contra entrega", etc.). Se ingresa a mano y se muestra en el PDF.
alter table ordenes_compra
  add column if not exists plazo_pago text;
