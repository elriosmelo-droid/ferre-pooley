import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatCLP } from "@/lib/money";

const filtros: { value: string; label: string }[] = [
  { value: "todas", label: "Todas" },
  { value: "sin-factura", label: "Sin factura" },
  { value: "diferencia", label: "Con diferencia" },
  { value: "cuadra", label: "Cuadra" },
];

type NotaRow = {
  id: string;
  folio: string;
  total: number;
  estado: string;
  created_at: string;
  clientes: { nombre: string } | null;
};

function clasificar(total: number, facturado: number, nFacturas: number) {
  if (nFacturas === 0) return "sin-factura";
  return total === facturado ? "cuadra" : "diferencia";
}

export default async function ConciliacionPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>;
}) {
  const { estado } = await searchParams;
  const filtroActivo = filtros.some((f) => f.value === estado)
    ? (estado as string)
    : "todas";

  const supabase = await createClient();

  const [{ data: notasData, error }, { data: ventasData }] = await Promise.all([
    supabase
      .from("notas_venta")
      .select("id, folio, total, estado, created_at, clientes(nombre)")
      .neq("estado", "anulada")
      .order("created_at", { ascending: false }),
    supabase.from("ventas_sii").select("nota_venta_id, monto_total"),
  ]);

  const notas = (notasData ?? []) as unknown as NotaRow[];

  const agg = new Map<string, { facturado: number; n: number }>();
  for (const v of ventasData ?? []) {
    if (!v.nota_venta_id) continue;
    const a = agg.get(v.nota_venta_id) ?? { facturado: 0, n: 0 };
    a.facturado += v.monto_total ?? 0;
    a.n += 1;
    agg.set(v.nota_venta_id, a);
  }

  const filas = notas
    .map((n) => {
      const a = agg.get(n.id) ?? { facturado: 0, n: 0 };
      return {
        ...n,
        facturado: a.facturado,
        nFacturas: a.n,
        estadoConc: clasificar(n.total, a.facturado, a.n),
      };
    })
    .filter((f) => filtroActivo === "todas" || f.estadoConc === filtroActivo);

  const badge: Record<string, string> = {
    "sin-factura": "bg-slate-100 text-slate-600",
    diferencia: "bg-amber-100 text-amber-700",
    cuadra: "bg-green-100 text-green-700",
  };
  const badgeLabel: Record<string, string> = {
    "sin-factura": "Sin factura",
    diferencia: "Diferencia",
    cuadra: "Cuadra",
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Conciliación</h1>
        <p className="mt-1 text-sm text-slate-500">
          Notas de venta contra sus facturas del SII. Una nota puede agrupar
          varias facturas (mercadería + flete). Entra a la nota para
          adjuntarlas.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {filtros.map((filtro) => (
          <Link
            key={filtro.value}
            href={
              filtro.value === "todas"
                ? "/conciliacion"
                : `/conciliacion?estado=${filtro.value}`
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
          No se pudo cargar la conciliación. Intenta nuevamente.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Nota</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3 text-right">Total nota</th>
                <th className="px-4 py-3 text-right">Facturado SII</th>
                <th className="px-4 py-3 text-right">Diferencia</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filas.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    No hay notas de venta con este estado.
                  </td>
                </tr>
              ) : (
                filas.map((f) => {
                  const diff = f.total - f.facturado;
                  return (
                    <tr key={f.id} className="text-slate-700">
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {f.folio}
                      </td>
                      <td className="px-4 py-3">{f.clientes?.nombre ?? "—"}</td>
                      <td className="px-4 py-3 text-right">
                        {formatCLP(f.total)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {f.nFacturas > 0 ? formatCLP(f.facturado) : "—"}
                        {f.nFacturas > 1 && (
                          <span className="ml-1 text-xs text-slate-400">
                            ({f.nFacturas})
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {f.estadoConc === "cuadra"
                          ? "—"
                          : f.nFacturas > 0
                            ? formatCLP(diff)
                            : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge[f.estadoConc]}`}
                        >
                          {badgeLabel[f.estadoConc]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/notas-venta/${f.id}`}
                          className="text-sm font-medium text-brand-600 hover:text-brand-800"
                        >
                          Conciliar
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
