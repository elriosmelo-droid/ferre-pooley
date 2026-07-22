import { createClient } from "@/lib/supabase/server";
import { signoDte } from "@/lib/dte-doc";
import { ConciliacionTabla, type ConciliacionRow } from "./conciliacion-tabla";

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

export default async function ConciliacionPage() {
  const supabase = await createClient();

  const [{ data: notasData, error }, { data: ventasData }] = await Promise.all([
    supabase
      .from("notas_venta")
      .select("id, folio, total, estado, created_at, clientes(nombre)")
      .neq("estado", "anulada")
      .order("created_at", { ascending: false }),
    supabase
      .from("ventas_sii")
      .select("nota_venta_id, monto_total, tipo_doc, fecha_emision"),
  ]);

  const notas = (notasData ?? []) as unknown as NotaRow[];

  const agg = new Map<string, { facturado: number; n: number; fem: string | null }>();
  for (const v of ventasData ?? []) {
    if (!v.nota_venta_id) continue;
    const a = agg.get(v.nota_venta_id) ?? { facturado: 0, n: 0, fem: null };
    // Facturas suman, notas de crédito restan.
    a.facturado += signoDte(v.tipo_doc) * (v.monto_total ?? 0);
    a.n += 1;
    // Fecha de referencia = emisión más antigua de sus facturas (33/34).
    if ((v.tipo_doc === 33 || v.tipo_doc === 34) && v.fecha_emision) {
      const d = String(v.fecha_emision).slice(0, 10);
      if (!a.fem || d < a.fem) a.fem = d;
    }
    agg.set(v.nota_venta_id, a);
  }

  const filas: ConciliacionRow[] = notas.map((n) => {
    const a = agg.get(n.id) ?? { facturado: 0, n: 0, fem: null };
    return {
      ...n,
      facturado: a.facturado,
      nFacturas: a.n,
      estadoConc: clasificar(n.total, a.facturado, a.n),
      // Para el filtro por mes: emisión de la factura, o creación si no tiene.
      fechaRef: a.fem ?? n.created_at.slice(0, 10),
    };
  });

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

      {error ? (
        <p className="text-sm text-red-600">
          No se pudo cargar la conciliación. Intenta nuevamente.
        </p>
      ) : (
        <ConciliacionTabla filas={filas} />
      )}
    </div>
  );
}
