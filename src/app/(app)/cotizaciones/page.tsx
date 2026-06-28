import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CotizacionesTabla, type CotizacionRow } from "./cotizaciones-tabla";

export default async function CotizacionesPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("cotizaciones")
    .select(
      "id, folio, created_at, fecha_validez, total, estado, clientes(nombre)"
    )
    .order("created_at", { ascending: false });

  const cotizaciones = (data ?? []) as unknown as CotizacionRow[];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Cotizaciones</h1>
        <Link
          href="/cotizaciones/nueva"
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
        >
          Nueva cotización
        </Link>
      </div>

      {error ? (
        <p className="text-sm text-red-600">
          No se pudieron cargar las cotizaciones. Intenta nuevamente.
        </p>
      ) : (
        <CotizacionesTabla cotizaciones={cotizaciones} />
      )}
    </div>
  );
}
