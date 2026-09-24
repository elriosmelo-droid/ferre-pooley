import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ProductosTabla, type ProductoRow } from "./productos-tabla";
import { requirePermiso } from "@/lib/auth/rol";
import { puedeVerCostos, tienePermiso } from "@/lib/auth/permisos";

export default async function ProductosPage() {
  const perfil = await requirePermiso("productos");
  const puedeEscribir = tienePermiso(perfil, "productos", "escritura");
  const verCostos = puedeVerCostos(perfil);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("productos")
    .select(
      "id, sku, sku_proveedor, descripcion, marca, unidad, costo, precio, activo"
    )
    .order("sku");

  // Sin «ver costos» el costo no viaja al navegador.
  const productos: ProductoRow[] = (data ?? []).map((p) =>
    verCostos ? p : { ...p, costo: 0 }
  );

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Productos</h1>
        {puedeEscribir && (
        <Link
          href="/productos/nuevo"
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
        >
          Nuevo producto
        </Link>
        )}
      </div>

      {error ? (
        <p className="text-sm text-red-600">
          No se pudieron cargar los productos. Intenta nuevamente.
        </p>
      ) : (
        <ProductosTabla
          productos={productos}
          puedeEscribir={puedeEscribir}
          verCostos={verCostos}
        />
      )}
    </div>
  );
}
