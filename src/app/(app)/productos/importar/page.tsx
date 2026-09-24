import { requirePermiso } from "@/lib/auth/rol";
import { puedeVerCostos } from "@/lib/auth/permisos";
import { ImportarProductos } from "./importar-productos";

export default async function ImportarProductosPage() {
  const perfil = await requirePermiso("productos", "escritura");
  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-slate-900">
        Carga masiva de productos
      </h1>
      <p className="mb-6 max-w-2xl text-sm text-slate-600">
        Descarga la plantilla, llénala con un producto por fila y súbela. Antes
        de guardar verás qué productos se crean, cuáles se actualizan (mismo SKU
        propio) y qué filas tienen errores.
        {!puedeVerCostos(perfil) &&
          " La columna Costo se ignora con tu perfil."}
      </p>
      <ImportarProductos verCostos={puedeVerCostos(perfil)} />
    </div>
  );
}
