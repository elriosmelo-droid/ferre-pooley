import { createClient } from "@/lib/supabase/server";
import { ActualizarComprasButton } from "./actualizar-button";
import { GenerarPdfsButton } from "./generar-pdfs-button";
import { ComprasTabla, type CompraRow } from "./compras-tabla";

// El sync del SII puede tardar (polling al RCV); el server action de actualizar
// corre en esta ruta, así que se le da margen de tiempo.
export const maxDuration = 300;

export default async function ComprasPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("compras_sii")
    .select(
      "id, tipo_doc, rut_proveedor, razon_social, folio, fecha_emision, monto_neto, monto_iva, monto_total"
    )
    .order("fecha_emision", { ascending: false, nullsFirst: false })
    .order("folio", { ascending: false });

  const compras = (data ?? []) as CompraRow[];

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
        <div className="flex items-start gap-2">
          <GenerarPdfsButton />
          <ActualizarComprasButton />
        </div>
      </div>

      {error ? (
        <p className="text-sm text-red-600">
          No se pudieron cargar las compras. Intenta nuevamente.
        </p>
      ) : (
        <ComprasTabla compras={compras} />
      )}
    </div>
  );
}
