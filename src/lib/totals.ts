export type ItemCalculable = {
  cantidad: number;
  precio: number;
  // Flete unitario: se suma al precio para obtener el precio efectivo de venta.
  flete?: number;
};

export const IVA_RATE = 0.19;

export function calcularTotales(items: ItemCalculable[]) {
  const subtotalNeto = items.reduce(
    (s, i) => s + i.cantidad * (i.precio + (i.flete ?? 0)),
    0
  );
  const iva = Math.round(subtotalNeto * IVA_RATE);
  return { subtotalNeto, iva, total: subtotalNeto + iva };
}
