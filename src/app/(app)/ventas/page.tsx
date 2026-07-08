import { createClient } from "@/lib/supabase/server";
import { ActualizarVentasButton } from "./actualizar-button";
import { VentasTabla, type VentaRow } from "./ventas-tabla";

// El sync del SII puede tardar (polling al RCV); el server action corre en esta
// ruta, así que se le da margen de tiempo.
export const maxDuration = 300;

export default async function VentasPage() {
  const supabase = await createClient();

  // Cada factura trae su nota vinculada embebida vía nota_venta_id.
  const { data, error } = await supabase
    .from("ventas_sii")
    .select(
      "id, tipo_doc, rut_cliente, razon_social, folio, fecha_emision, monto_total, forma_pago, term_pago_dias, fecha_vencimiento, fecha_vencimiento_manual, notas_venta(id, folio)"
    )
    .order("fecha_emision", { ascending: false, nullsFirst: false })
    .order("folio", { ascending: false });

  const ventas = (data ?? []) as unknown as VentaRow[];

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
        <VentasTabla ventas={ventas} />
      )}
    </div>
  );
}
