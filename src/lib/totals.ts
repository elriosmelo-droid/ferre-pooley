export type ItemCalculable = {
  cantidad: number;
  precio: number;
  // Flete unitario: se suma al precio para obtener el precio efectivo de venta.
  flete?: number;
  // Descuento porcentual (0–100) aplicado SOLO sobre el precio, no sobre el flete.
  descuento?: number;
};

export const IVA_RATE = 0.19;

// Descuento unitario en pesos: porcentaje sobre el precio, redondeado al peso.
export function descuentoUnitario(precio: number, descuento: number): number {
  return Math.round((precio * descuento) / 100);
}

export function calcularTotales(items: ItemCalculable[]) {
  let subtotalBruto = 0;
  let descuento = 0;
  for (const i of items) {
    const flete = i.flete ?? 0;
    const descUnit = descuentoUnitario(i.precio, i.descuento ?? 0);
    subtotalBruto += i.cantidad * (i.precio + flete);
    descuento += i.cantidad * descUnit;
  }
  const subtotalNeto = subtotalBruto - descuento;
  const iva = Math.round(subtotalNeto * IVA_RATE);
  return { subtotalBruto, descuento, subtotalNeto, iva, total: subtotalNeto + iva };
}
