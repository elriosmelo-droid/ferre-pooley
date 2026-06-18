import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatCLP } from "@/lib/money";
import { NotaEstadoBadge, type NotaVentaEstado } from "./nota-estado-badge";

type NotaVentaRow = {
  id: string;
  folio: string;
  created_at: string;
  total: number;
  estado: NotaVentaEstado;
  clientes: { nombre: string } | null;
  cotizaciones: { id: string; folio: string } | null;
};

const filtros: { value: string; label: string }[] = [
  { value: "todas", label: "Todas" },
  { value: "pendiente", label: "Pendiente de pago" },
  { value: "pagada", label: "Pagada" },
  { value: "anulada", label: "Anulada" },
];

export default async function NotasVentaPage({
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
    .from("notas_venta")
    .select(
      "id, folio, created_at, total, estado, clientes(nombre), cotizaciones(id, folio)"
    )
    .order("created_at", { ascending: false });

  if (filtroActivo !== "todas") {
    query = query.eq("estado", filtroActivo);
  }

  const { data, error } = await query;
  const notas = (data ?? []) as unknown as NotaVentaRow[];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Notas de Venta</h1>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {filtros.map((filtro) => (
          <Link
            key={filtro.value}
            href={
              filtro.value === "todas"
                ? "/notas-venta"
                : `/notas-venta?estado=${filtro.value}`
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
          No se pudieron cargar las notas de venta. Intenta nuevamente.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Folio</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Cotización</th>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {notas.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    {filtroActivo !== "todas"
                      ? "No hay notas de venta con este estado."
                      : "Aún no hay notas de venta. Se crean automáticamente cuando un cliente acepta una cotización."}
                  </td>
                </tr>
              ) : (
                notas.map((nota) => (
                  <tr key={nota.id} className="text-slate-700">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {nota.folio}
                    </td>
                    <td className="px-4 py-3">
                      {nota.clientes?.nombre ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      {nota.cotizaciones ? (
                        <Link
                          href={`/cotizaciones/${nota.cotizaciones.id}`}
                          className="font-medium text-brand-600 hover:text-brand-800"
                        >
                          {nota.cotizaciones.folio}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {new Date(nota.created_at).toLocaleDateString("es-CL", {
                        timeZone: "America/Santiago",
                      })}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-900">
                      {formatCLP(nota.total)}
                    </td>
                    <td className="px-4 py-3">
                      <NotaEstadoBadge estado={nota.estado} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/notas-venta/${nota.id}`}
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
