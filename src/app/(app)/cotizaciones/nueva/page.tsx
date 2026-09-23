import { createClient } from "@/lib/supabase/server";
import { crearCotizacion } from "../actions";
import { CotizacionForm } from "../cotizacion-form";
import { requirePermiso } from "@/lib/auth/rol";

export default async function NuevaCotizacionPage() {
  await requirePermiso("cotizaciones", "escritura");
  const supabase = await createClient();

  const [{ data: clientes }, { data: productos }] = await Promise.all([
    supabase.from("clientes").select("id, nombre, rut").order("nombre"),
    supabase
      .from("productos")
      .select("id, sku, descripcion, costo, precio")
      .eq("activo", true)
      .order("sku"),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-slate-900">
        Nueva cotización
      </h1>
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <CotizacionForm
          clientes={clientes ?? []}
          productos={productos ?? []}
          action={crearCotizacion}
        />
      </div>
    </div>
  );
}
