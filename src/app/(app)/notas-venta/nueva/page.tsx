import { createClient } from "@/lib/supabase/server";
import { crearNotaVenta } from "../actions";
import { NotaVentaForm } from "../nota-venta-form";
import { requirePermiso } from "@/lib/auth/rol";
import { puedeVerCostos } from "@/lib/auth/permisos";

export default async function NuevaNotaVentaPage() {
  const perfil = await requirePermiso("notas_venta", "escritura");
  const supabase = await createClient();

  const [{ data: clientes }, { data: productos }] = await Promise.all([
    supabase.from("clientes").select("id, nombre, rut").order("nombre"),
    supabase
      .from("productos")
      .select("id, sku, descripcion, costo, precio")
      .eq("activo", true)
      .order("sku"),
  ]);
  const verCostos = puedeVerCostos(perfil);
  // Sin «ver costos» el costo no viaja al navegador. El flete sí (el total de
  // la línea lo incluye) pero no se muestra.
  const productosForm = (productos ?? []).map((p) =>
    verCostos ? p : { ...p, costo: 0 }
  );

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-slate-900">
        Nueva nota de venta
      </h1>
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <NotaVentaForm
          clientes={clientes ?? []}
          productos={productosForm}
          verCostos={verCostos}
          action={crearNotaVenta}
        />
      </div>
    </div>
  );
}
