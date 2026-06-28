import { createClient } from "@/lib/supabase/server";
import { NotasVentaTabla, type NotaVentaRow } from "./notas-venta-tabla";

export default async function NotasVentaPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("notas_venta")
    .select(
      "id, folio, created_at, total, estado, clientes(nombre), cotizaciones(id, folio)"
    )
    .order("created_at", { ascending: false });

  const notas = (data ?? []) as unknown as NotaVentaRow[];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Notas de Venta</h1>
      </div>

      {error ? (
        <p className="text-sm text-red-600">
          No se pudieron cargar las notas de venta. Intenta nuevamente.
        </p>
      ) : (
        <NotasVentaTabla notas={notas} />
      )}
    </div>
  );
}
