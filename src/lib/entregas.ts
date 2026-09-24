// Entrega de ítems de notas de venta.

export function resumenEntrega(items: { entregado: boolean }[]) {
  return {
    items: items.length,
    pendientes: items.filter((i) => !i.entregado).length,
  };
}

type Entrega = { entregado: boolean; entregado_at: string | null };

const clave = (i: { sku: string; descripcion: string }) =>
  `${i.sku.trim().toLowerCase()}|${i.descripcion.trim().toLowerCase()}`;

// Editar una nota reemplaza sus ítems: la marca de entregado pasa a los ítems
// nuevos que calzan con uno previo (mismo SKU y descripción), usando cada
// previo una sola vez y en orden. Lo que no calza parte sin entregar.
export function conservarEntregas<T extends { sku: string; descripcion: string }>(
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
      entregado: previo?.entregado ?? false,
      entregado_at: previo?.entregado_at ?? null,
    };
  });
}
