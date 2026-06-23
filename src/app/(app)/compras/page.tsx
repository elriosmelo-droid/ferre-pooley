import { createClient } from "@/lib/supabase/server";
import { formatCLP } from "@/lib/money";
import { ActualizarComprasButton } from "./actualizar-button";

// El sync del SII puede tardar (polling al RCV); el server action de actualizar
// corre en esta ruta, así que se le da margen de tiempo.
export const maxDuration = 300;

const TIPO_DOC: Record<number, string> = {
  33: "Factura electrónica",
  34: "Factura exenta",
  56: "Nota de débito",
  61: "Nota de crédito",
};

type CompraRow = {
  id: string;
  periodo: string;
  tipo_doc: number;
  rut_proveedor: string;
  razon_social: string | null;
  folio: string;
  fecha_emision: string | null;
  monto_neto: number;
  monto_iva: number;
  monto_total: number;
};

function formatFecha(iso: string | null): string {
  if (!iso) return "—";
  // fecha_emision es un date 'AAAA-MM-DD'; se arma local para no correr el día.
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export default async function ComprasPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("compras_sii")
    .select(
      "id, periodo, tipo_doc, rut_proveedor, razon_social, folio, fecha_emision, monto_neto, monto_iva, monto_total"
    )
    .order("fecha_emision", { ascending: false, nullsFirst: false })
    .order("folio", { ascending: false });

  const compras = (data ?? []) as CompraRow[];
  const totalNeto = compras.reduce((s, c) => s + c.monto_neto, 0);
  const totalIva = compras.reduce((s, c) => s + c.monto_iva, 0);
  const totalTotal = compras.reduce((s, c) => s + c.monto_total, 0);

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Compras</h1>
          <p className="mt-1 text-sm text-slate-500">
            Facturas de compra del SII (Registro de Compra y Venta). Se
            actualizan cada hora; también puedes refrescarlas a mano.
          </p>
        </div>
        <ActualizarComprasButton />
      </div>

      {error ? (
        <p className="text-sm text-red-600">
          No se pudieron cargar las compras. Intenta nuevamente.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Proveedor</th>
                <th className="px-4 py-3">Documento</th>
                <th className="px-4 py-3">Folio</th>
                <th className="px-4 py-3 text-right">Neto</th>
                <th className="px-4 py-3 text-right">IVA</th>
                <th className="px-4 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {compras.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    Aún no hay compras. Usa “Actualizar compras” para traerlas
                    del SII.
                  </td>
                </tr>
              ) : (
                compras.map((c) => (
                  <tr key={c.id} className="text-slate-700">
                    <td className="px-4 py-3 whitespace-nowrap">
                      {formatFecha(c.fecha_emision)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">
                        {c.razon_social ?? "—"}
                      </div>
                      <div className="text-xs text-slate-500">
                        {c.rut_proveedor}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {TIPO_DOC[c.tipo_doc] ?? `Tipo ${c.tipo_doc}`}
                    </td>
                    <td className="px-4 py-3">{c.folio}</td>
                    <td className="px-4 py-3 text-right">
                      {formatCLP(c.monto_neto)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {formatCLP(c.monto_iva)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-900">
                      {formatCLP(c.monto_total)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {compras.length > 0 && (
              <tfoot className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-900">
                <tr>
                  <td className="px-4 py-3" colSpan={4}>
                    {compras.length} compra{compras.length === 1 ? "" : "s"}
                  </td>
                  <td className="px-4 py-3 text-right">{formatCLP(totalNeto)}</td>
                  <td className="px-4 py-3 text-right">{formatCLP(totalIva)}</td>
                  <td className="px-4 py-3 text-right">{formatCLP(totalTotal)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}
