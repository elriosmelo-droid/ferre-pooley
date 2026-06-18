import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatCLP } from "@/lib/money";
import { EstadoBadge, type CotizacionEstado } from "./estado-badge";

type CotizacionRow = {
  id: string;
  folio: string;
  created_at: string;
  fecha_validez: string;
  total: number;
  estado: CotizacionEstado;
  clientes: { nombre: string } | null;
};

const filtros: { value: string; label: string }[] = [
  { value: "todas", label: "Todas" },
  { value: "borrador", label: "Borrador" },
  { value: "enviada", label: "Enviada" },
  { value: "aceptada", label: "Aceptada" },
  { value: "rechazada", label: "Rechazada" },
  { value: "vencida", label: "Vencida" },
];

function formatFecha(value: string) {
  const [anio, mes, dia] = value.slice(0, 10).split("-");
  return `${dia}-${mes}-${anio}`;
}

export default async function CotizacionesPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>;
}) {
  const { estado } = await searchParams;
  const filtroActivo = filtros.some((f) => f.value === estado)
    ? (estado as string)
    : "todas";

  const supabase = await createClient();

  let query = supabase
    .from("cotizaciones")
    .select(
      "id, folio, created_at, fecha_validez, total, estado, clientes(nombre)"
    )
    .order("created_at", { ascending: false });

  if (filtroActivo !== "todas") {
    query = query.eq("estado", filtroActivo);
  }

  const { data, error } = await query;
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

      <div className="mb-4 flex flex-wrap gap-2">
        {filtros.map((filtro) => (
          <Link
            key={filtro.value}
            href={
              filtro.value === "todas"
                ? "/cotizaciones"
                : `/cotizaciones?estado=${filtro.value}`
            }
            className={
              filtroActivo === filtro.value
                ? "rounded-full bg-brand-600 px-3 py-1 text-sm font-medium text-white"
                : "rounded-full border border-slate-300 bg-white px-3 py-1 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
            }
          >
            {filtro.label}
          </Link>
        ))}
      </div>

      {error ? (
        <p className="text-sm text-red-600">
          No se pudieron cargar las cotizaciones. Intenta nuevamente.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Folio</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Válida hasta</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cotizaciones.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    {filtroActivo !== "todas"
                      ? "No hay cotizaciones con este estado."
                      : "Aún no hay cotizaciones registradas."}
                  </td>
                </tr>
              ) : (
                cotizaciones.map((cotizacion) => (
                  <tr key={cotizacion.id} className="text-slate-700">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {cotizacion.folio}
                    </td>
                    <td className="px-4 py-3">
                      {cotizacion.clientes?.nombre ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      {new Date(cotizacion.created_at).toLocaleDateString(
                        "es-CL",
                        { timeZone: "America/Santiago" }
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {formatFecha(cotizacion.fecha_validez)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-900">
                      {formatCLP(cotizacion.total)}
                    </td>
                    <td className="px-4 py-3">
                      <EstadoBadge estado={cotizacion.estado} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/cotizaciones/${cotizacion.id}`}
                        className="text-sm font-medium text-brand-600 hover:text-brand-800"
                      >
                        Ver
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
