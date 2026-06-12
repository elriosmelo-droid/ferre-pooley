export type ItemCalculable = { cantidad: number; precio: number };

export const IVA_RATE = 0.19;

export function calcularTotales(items: ItemCalculable[], flete: number) {
  const subtotalNeto = items.reduce((s, i) => s + i.cantidad * i.precio, 0);
  const iva = Math.round((subtotalNeto + flete) * IVA_RATE);
  return { subtotalNeto, flete, iva, total: subtotalNeto + flete + iva };
}
