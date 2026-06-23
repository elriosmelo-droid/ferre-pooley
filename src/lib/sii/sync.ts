import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { descargarCompras } from "./rcv";

export type SyncResult = {
  periodos: string[];
  encontradas: number;
  guardadas: number;
};

// 'AAAAMM' del mes con offset (0 = mes actual, -1 = mes anterior).
function periodoConOffset(offset: number): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Baja las compras del SII (mes actual + anterior, porque las facturas se
// registran con retraso) y las upserta en compras_sii. El upsert por la clave
// natural (tipo_doc, rut_proveedor, folio) hace la operación idempotente: se
// puede correr cada hora o a mano sin duplicar. Lo usan tanto el cron
// (/api/sii/sync) como la acción del botón "Actualizar compras".
export async function sincronizarCompras(): Promise<SyncResult> {
  const periodos = [periodoConOffset(0), periodoConOffset(-1)];
  const compras = await descargarCompras(periodos);

  if (compras.length === 0) {
    return { periodos, encontradas: 0, guardadas: 0 };
  }

  const ahora = new Date().toISOString();
  const filas = compras.map((c) => ({
    periodo: c.periodo,
    tipo_doc: c.tipoDoc,
    rut_proveedor: c.rutProveedor,
    razon_social: c.razonSocial,
    folio: c.folio,
    fecha_emision: c.fechaEmision,
    fecha_recepcion: c.fechaRecepcion,
    monto_exento: c.montoExento,
    monto_neto: c.montoNeto,
    monto_iva: c.montoIva,
    monto_total: c.montoTotal,
    estado_contab: c.estadoContab,
    raw: c.raw,
    updated_at: ahora,
  }));

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("compras_sii")
    .upsert(filas, { onConflict: "tipo_doc,rut_proveedor,folio" });

  if (error) {
    console.error("Error al guardar compras del SII:", error.message);
    throw new Error("No se pudieron guardar las compras.");
  }

  return { periodos, encontradas: compras.length, guardadas: filas.length };
}
