import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatCLP } from "@/lib/money";
import { EstadoBadge, type OrdenCompraEstado } from "./estado-badge";

type OrdenRow = {
  id: string;
  folio: string;
  created_at: string;
  total: number;
  estado: OrdenCompraEstado;
  proveedores: { razon_social: string | null; rut: string } | null;
};

const filtros: { value: string; label: string }[] = [
  { value: "todas", label: "Todas" },
  { value: "borrador", label: "Borrador" },
  { value: "enviada", label: "Enviada" },
  { value: "recibida", label: "Recibida" },
  { value: "cerrada", label: "Cerrada" },
];

export default async function OrdenesCompraPage({
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
    .from("ordenes_compra")
    .select("id, folio, created_at, total, estado, proveedores(razon_social, rut)")
    .order("created_at", { ascending: false });

  if (filtroActivo !== "todas") {
    query = query.eq("estado", filtroActivo);
  }

  const { data, error } = await query;
  const ordenes = (data ?? []) as unknown as OrdenRow[];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Órdenes de compra</h1>
        <Link
          href="/ordenes-compra/nueva"
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
        >
          Nueva orden
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {filtros.map((filtro) => (
          <Link
            key={filtro.value}
            href={
              filtro.value === "todas"
                ? "/ordenes-compra"
                : `/ordenes-compra?estado=${filtro.value}`
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
          No se pudieron cargar las órdenes. Intenta nuevamente.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Folio</th>
                <th className="px-4 py-3">Proveedor</th>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ordenes.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    {filtroActivo !== "todas"
                      ? "No hay órdenes con este estado."
                      : "Aún no hay órdenes de compra registradas."}
                  </td>
                </tr>
              ) : (
                ordenes.map((orden) => (
                  <tr key={orden.id} className="text-slate-700">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {orden.folio}
                    </td>
                    <td className="px-4 py-3">
                      {orden.proveedores?.razon_social ??
                        orden.proveedores?.rut ??
                        "—"}
                    </td>
                    <td className="px-4 py-3">
                      {new Date(orden.created_at).toLocaleDateString("es-CL", {
                        timeZone: "America/Santiago",
                      })}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-900">
                      {formatCLP(orden.total)}
                    </td>
                    <td className="px-4 py-3">
                      <EstadoBadge estado={orden.estado} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/ordenes-compra/${orden.id}`}
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
