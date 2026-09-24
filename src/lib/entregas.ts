// Entrega de ítems de notas de venta: cada ítem guarda cuánto se entregó.

type ItemEntrega = { cantidad: number; cantidad_entregada: number };

export type EstadoItemEntrega = "pendiente" | "parcial" | "entregado";

export function estadoItem(i: ItemEntrega): EstadoItemEntrega {
  if (i.cantidad_entregada >= i.cantidad) return "entregado";
  return i.cantidad_entregada > 0 ? "parcial" : "pendiente";
}

export type EstadoNotaEntrega = "sin_items" | "pendiente" | "parcial" | "entregada";

export function resumenEntrega(items: ItemEntrega[]) {
  const estados = items.map(estadoItem);
  const entregados = estados.filter((e) => e === "entregado").length;
  const parciales = estados.filter((e) => e === "parcial").length;
  const pendientes = estados.filter((e) => e === "pendiente").length;
  const estado: EstadoNotaEntrega =
    items.length === 0
      ? "sin_items"
      : entregados === items.length
        ? "entregada"
        : pendientes === items.length
          ? "pendiente"
          : "parcial";
  return { items: items.length, entregados, parciales, pendientes, estado };
}

type Entrega = { cantidad_entregada: number; entregado_at: string | null };

const clave = (i: { sku: string; descripcion: string }) =>
  `${i.sku.trim().toLowerCase()}|${i.descripcion.trim().toLowerCase()}`;

// Editar una nota reemplaza sus ítems: lo entregado pasa a los ítems nuevos
// que calzan con uno previo (mismo SKU y descripción), usando cada previo una
// sola vez y en orden, sin superar la nueva cantidad. Lo demás parte en 0.
export function conservarEntregas<
  T extends { sku: string; descripcion: string; cantidad: number },
>(
  nuevos: T[],
  previos: ({ sku: string; descripcion: string } & Entrega)[]
): (T & Entrega)[] {
  const disponibles = new Map<string, Entrega[]>();
  for (const p of previos) {
    const k = clave(p);
    disponibles.set(k, [...(disponibles.get(k) ?? []), p]);
  }
  return nuevos.map((n) => {
    const previo = disponibles.get(clave(n))?.shift();
    return {
      ...n,
      cantidad_entregada: Math.min(previo?.cantidad_entregada ?? 0, Math.max(n.cantidad, 0)),
      entregado_at: previo?.entregado_at ?? null,
    };
  });
}
