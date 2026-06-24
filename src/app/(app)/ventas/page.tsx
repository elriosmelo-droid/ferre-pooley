import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatCLP } from "@/lib/money";
import { ActualizarVentasButton } from "./actualizar-button";

// El sync del SII puede tardar (polling al RCV); el server action corre en esta
// ruta, así que se le da margen de tiempo.
export const maxDuration = 300;

const TIPO_DOC: Record<number, string> = {
  33: "Factura electrónica",
  34: "Factura exenta",
  56: "Nota de débito",
  61: "Nota de crédito",
};

type VentaRow = {
  id: string;
  tipo_doc: number;
  rut_cliente: string;
  razon_social: string | null;
  folio: string;
  fecha_emision: string | null;
  monto_neto: number;
  monto_iva: number;
  monto_total: number;
};

function formatFecha(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export default async function VentasPage() {
  const supabase = await createClient();

  // Cada factura trae su nota vinculada embebida vía nota_venta_id.
  const { data, error } = await supabase
    .from("ventas_sii")
    .select(
      "id, tipo_doc, rut_cliente, razon_social, folio, fecha_emision, monto_neto, monto_iva, monto_total, notas_venta(id, folio)"
    )
    .order("fecha_emision", { ascending: false, nullsFirst: false })
    .order("folio", { ascending: false });

  const ventas = (data ?? []) as unknown as (VentaRow & {
    notas_venta: { id: string; folio: string } | null;
  })[];

  const totalTotal = ventas.reduce((s, v) => s + v.monto_total, 0);

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Ventas</h1>
          <p className="mt-1 text-sm text-slate-500">
            Facturas emitidas del SII, vinculadas con sus notas de venta. Se
            actualizan cada noche; también puedes refrescarlas a mano.
          </p>
        </div>
        <ActualizarVentasButton />
      </div>

      {error ? (
        <p className="text-sm text-red-600">
          No se pudieron cargar las ventas. Intenta nuevamente.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Documento</th>
                <th className="px-4 py-3">Folio SII</th>
                <th className="px-4 py-3">Nota de venta</th>
                <th className="px-4 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ventas.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    Aún no hay ventas. Usa “Actualizar ventas” para traerlas del
                    SII.
                  </td>
                </tr>
              ) : (
                ventas.map((v) => {
                  const nota = v.notas_venta;
                  return (
                    <tr key={v.id} className="text-slate-700">
                      <td className="px-4 py-3 whitespace-nowrap">
                        {formatFecha(v.fecha_emision)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">
                          {v.razon_social ?? "—"}
                        </div>
                        <div className="text-xs text-slate-500">
                          {v.rut_cliente}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {TIPO_DOC[v.tipo_doc] ?? `Tipo ${v.tipo_doc}`}
                      </td>
                      <td className="px-4 py-3">{v.folio}</td>
                      <td className="px-4 py-3">
                        {nota ? (
                          <Link
                            href={`/notas-venta/${nota.id}`}
                            className="font-medium text-brand-600 hover:text-brand-800"
                          >
                            {nota.folio}
                          </Link>
                        ) : (
                          <span className="text-slate-400">Sin vincular</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-slate-900">
                        {formatCLP(v.monto_total)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {ventas.length > 0 && (
              <tfoot className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-900">
                <tr>
                  <td className="px-4 py-3" colSpan={5}>
                    {ventas.length} venta{ventas.length === 1 ? "" : "s"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {formatCLP(totalTotal)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}
