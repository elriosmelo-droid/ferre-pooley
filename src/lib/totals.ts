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

export type ItemMargen = {
  cantidad: number;
  precio: number;
  costo: number;
  descuento?: number;
};

// Margen porcentual de una línea sobre la venta (precio con descuento, sin
// flete): (precioConDesc − costo) / precioConDesc. Devuelve 0 si no hay venta.
export function margenPctLinea(
  precio: number,
  costo: number,
  descuento = 0
): number {
  const venta = precio - descuentoUnitario(precio, descuento);
  return venta > 0 ? ((venta - costo) / venta) * 100 : 0;
}

// Margen total (interno) de un conjunto de líneas: monto y % sobre la venta.
// El flete no entra al margen (es un cargo aparte).
export function calcularMargen(items: ItemMargen[]) {
  let venta = 0;
  let costo = 0;
  for (const i of items) {
    const precioConDesc = i.precio - descuentoUnitario(i.precio, i.descuento ?? 0);
    venta += i.cantidad * precioConDesc;
    costo += i.cantidad * i.costo;
  }
  const margen = venta - costo;
  const pct = venta > 0 ? (margen / venta) * 100 : 0;
  return { venta, costo, margen, pct };
}

// Formatea un porcentaje con un decimal ("34.2%").
export function formatPct(n: number): string {
  return `${n.toFixed(1)}%`;
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
