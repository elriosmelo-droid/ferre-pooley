import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { descargarCompras, descargarVentas } from "./rcv";
import { normalizarRut } from "@/lib/rut";
import type { SupabaseClient } from "@supabase/supabase-js";

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

  // Auto-sync de proveedores: un registro por RUT. No se incluye `tipo` en el
  // payload para no pisar la clasificación manual del usuario en los que ya
  // existen; los nuevos quedan sin clasificar.
  const proveedores = [
    ...new Map(
      compras.map((c) => [
        c.rutProveedor,
        {
          rut: c.rutProveedor,
          razon_social: c.razonSocial,
          updated_at: ahora,
        },
      ])
    ).values(),
  ];
  const { error: provError } = await supabase
    .from("proveedores")
    .upsert(proveedores, { onConflict: "rut" });
  if (provError) {
    // No es fatal para el sync de compras; se registra y sigue.
    console.error("Error al sincronizar proveedores:", provError.message);
  }

  return { periodos, encontradas: compras.length, guardadas: filas.length };
}

export type SyncVentasResult = SyncResult & { vinculadas: number };

// Baja las ventas (facturas emitidas) del SII y las upserta en ventas_sii.
// Luego intenta vincularlas automáticamente con notas de venta. Va en un
// endpoint/cron aparte del de compras porque cada descarga tarda ~4min y no
// caben las dos en el límite de 300s de una función serverless.
export async function sincronizarVentas(): Promise<SyncVentasResult> {
  const periodos = [periodoConOffset(0), periodoConOffset(-1)];
  const ventas = await descargarVentas(periodos);
  const supabase = createAdminClient();

  if (ventas.length === 0) {
    const vinculadas = await autoVincularVentas(supabase);
    return { periodos, encontradas: 0, guardadas: 0, vinculadas };
  }

  const ahora = new Date().toISOString();
  // En ventas `rutProveedor`/`razonSocial` del mapeo del RCV son, en realidad,
  // el RUT y la razón social del cliente (contraparte del documento).
  const filas = ventas.map((v) => ({
    periodo: v.periodo,
    tipo_doc: v.tipoDoc,
    rut_cliente: v.rutProveedor,
    razon_social: v.razonSocial,
    folio: v.folio,
    fecha_emision: v.fechaEmision,
    fecha_recepcion: v.fechaRecepcion,
    monto_exento: v.montoExento,
    monto_neto: v.montoNeto,
    monto_iva: v.montoIva,
    monto_total: v.montoTotal,
    estado_contab: v.estadoContab,
    raw: v.raw,
    updated_at: ahora,
  }));

  const { error } = await supabase
    .from("ventas_sii")
    .upsert(filas, { onConflict: "tipo_doc,rut_cliente,folio" });

  if (error) {
    console.error("Error al guardar ventas del SII:", error.message);
    throw new Error("No se pudieron guardar las ventas.");
  }

  const vinculadas = await autoVincularVentas(supabase);
  return {
    periodos,
    encontradas: ventas.length,
    guardadas: filas.length,
    vinculadas,
  };
}

// Día calendario de un timestamptz, en horario de Chile, como número de días
// epoch para comparar ventanas sin líos de zona.
function diaEpoch(iso: string): number {
  return Math.floor(new Date(iso).getTime() / 86_400_000);
}

// Vincula notas de venta con facturas del SII que aún no estén asociadas. Regla
// conservadora: mismo RUT de cliente + mismo total, y la factura emitida en una
// ventana razonable respecto a la nota. Solo vincula cuando hay exactamente UNA
// factura candidata para esa nota (y no se reusa una factura ya tomada en esta
// pasada), para no enlazar a ciegas. Lo dudoso queda para vínculo manual.
const VENTANA_DIAS_ANTES = 5;
const VENTANA_DIAS_DESPUES = 60;

export async function autoVincularVentas(
  supabase: SupabaseClient
): Promise<number> {
  // Notas sin factura asociada (las anuladas no se cruzan).
  const { data: notasData } = await supabase
    .from("notas_venta")
    .select("id, total, created_at, clientes(rut)")
    .is("venta_sii_id", null)
    .neq("estado", "anulada");

  // Facturas del SII todavía no vinculadas a ninguna nota.
  const { data: notasLinkeadas } = await supabase
    .from("notas_venta")
    .select("venta_sii_id")
    .not("venta_sii_id", "is", null);
  const tomadas = new Set(
    (notasLinkeadas ?? []).map((n) => n.venta_sii_id as string)
  );

  const { data: ventasData } = await supabase
    .from("ventas_sii")
    .select("id, rut_cliente, monto_total, fecha_emision");

  const notas = (notasData ?? []) as unknown as {
    id: string;
    total: number;
    created_at: string;
    clientes: { rut: string | null } | null;
  }[];
  const ventas = (ventasData ?? []) as {
    id: string;
    rut_cliente: string;
    monto_total: number;
    fecha_emision: string | null;
  }[];

  const disponibles = ventas.filter((v) => !tomadas.has(v.id));
  let vinculadas = 0;

  for (const nota of notas) {
    const rutNota = normalizarRut(nota.clientes?.rut);
    if (!rutNota) continue;
    const diaNota = diaEpoch(nota.created_at);

    const candidatas = disponibles.filter((v) => {
      if (tomadas.has(v.id)) return false;
      if (normalizarRut(v.rut_cliente) !== rutNota) return false;
      if (v.monto_total !== nota.total) return false;
      if (!v.fecha_emision) return false;
      const diaFactura = diaEpoch(v.fecha_emision);
      return (
        diaFactura >= diaNota - VENTANA_DIAS_ANTES &&
        diaFactura <= diaNota + VENTANA_DIAS_DESPUES
      );
    });

    if (candidatas.length !== 1) continue; // 0 o ambiguo -> manual
    const factura = candidatas[0];

    const { error } = await supabase
      .from("notas_venta")
      .update({ venta_sii_id: factura.id })
      .eq("id", nota.id)
      .is("venta_sii_id", null);
    if (!error) {
      tomadas.add(factura.id);
      vinculadas += 1;
    }
  }

  return vinculadas;
}
