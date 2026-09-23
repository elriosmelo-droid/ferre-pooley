import type { SupabaseClient } from "@supabase/supabase-js";

// Un vendedor sin «ver costos» no recibe costo ni flete en el formulario, así
// que manda 0. Al guardar, el server restaura los valores reales para no
// destruir el margen: se conserva lo que ya tenía cada línea del documento y,
// para líneas nuevas, se usa el costo del catálogo.

export type ItemConCostos = {
  producto_id: string | null;
  sku: string;
  descripcion: string;
  costo: number;
  flete: number;
};

export type ItemPrevio = {
  producto_id?: string | null;
  sku: string;
  descripcion: string;
  costo: number;
  flete: number;
};

// Claves con las que una línea puede calzar con otra: primero por producto,
// luego por sku+descripción (nota_venta_items no guarda producto_id).
function claves(i: { producto_id?: string | null; sku: string; descripcion: string }) {
  const k = [`d:${i.sku.trim()}|${i.descripcion.trim()}`];
  if (i.producto_id) k.unshift(`p:${i.producto_id}`);
  return k;
}

export function restaurarCostosOcultos<T extends ItemConCostos>(
  items: T[],
  previos: ItemPrevio[],
  costoProducto: Map<string, number>
): T[] {
  const usados = new Set<number>();
  return items.map((item) => {
    const k = claves(item);
    const idx = previos.findIndex(
      (p, i) => !usados.has(i) && claves(p).some((c) => k.includes(c))
    );
    if (idx >= 0) {
      usados.add(idx);
      return { ...item, costo: previos[idx].costo, flete: previos[idx].flete };
    }
    const costo = item.producto_id ? (costoProducto.get(item.producto_id) ?? 0) : 0;
    return { ...item, costo, flete: 0 };
  });
}

export async function costosDeProductos(
  supabase: SupabaseClient,
  items: { producto_id: string | null }[]
): Promise<Map<string, number>> {
  const ids = [...new Set(items.map((i) => i.producto_id).filter((x): x is string => !!x))];
  if (ids.length === 0) return new Map();
  const { data } = await supabase.from("productos").select("id, costo").in("id", ids);
  return new Map((data ?? []).map((p) => [p.id as string, p.costo as number]));
}
