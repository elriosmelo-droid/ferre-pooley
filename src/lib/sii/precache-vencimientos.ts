import { createAdminClient } from "@/lib/supabase/admin";
import { descargarDteEmitidoXml } from "./mipe";
import { parseDte } from "./dte-xml";

// Tope por corrida: cada factura baja su DTE (abre sesión al SII), acotado para
// no exceder el maxDuration ni gatillar el rate-limit.
const MAX_POR_CORRIDA = 40;

function addDias(fechaISO: string, dias: number): string {
  const d = new Date(`${fechaISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export type PrecacheVencResult = {
  procesadas: number;
  conVencimiento: number;
  restantes: number;
};

// Baja el DTE de las facturas/ND sin procesar y guarda forma de pago, plazo y
// vencimiento. Idempotente y acotado; lo que no alcance lo toma la corrida
// siguiente. Solo 33/34/56 (las NC no vencen).
export async function precachearVencimientos(
  max = MAX_POR_CORRIDA
): Promise<PrecacheVencResult> {
  const db = createAdminClient();

  const { data: facturas } = await db
    .from("ventas_sii")
    .select("id, tipo_doc, folio, fecha_emision")
    .in("tipo_doc", [33, 34, 56])
    .eq("venc_procesado", false)
    .not("fecha_emision", "is", null)
    .order("fecha_emision", { ascending: false })
    .limit(max);

  let procesadas = 0;
  let conVencimiento = 0;

  for (const f of facturas ?? []) {
    let xml: string | null;
    try {
      xml = await descargarDteEmitidoXml({
        fecha: f.fecha_emision as string,
        folio: f.folio,
        tipoDoc: f.tipo_doc,
      });
    } catch (e) {
      // Error transitorio (429 / red / certificado): cortar y retomar luego.
      console.error(
        "Precache venc: error al bajar DTE",
        f.folio,
        e instanceof Error ? e.message : e
      );
      break;
    }

    let forma_pago: number | null = null;
    let term_pago_dias: number | null = null;
    let fecha_vencimiento: string | null = null;

    if (xml) {
      const { idDoc } = parseDte(xml);
      forma_pago = idDoc.fmaPago;
      term_pago_dias = idDoc.termPagoDias;
      if (idDoc.fchVenc) {
        fecha_vencimiento = idDoc.fchVenc;
      } else if (idDoc.termPagoDias && forma_pago !== 1) {
        // Sin FchVenc pero con plazo (y no contado): emisión + plazo.
        fecha_vencimiento = addDias(f.fecha_emision as string, idDoc.termPagoDias);
      }
      if (fecha_vencimiento) conVencimiento++;
    }

    // Se marca procesada aunque no haya DTE (nada que traer) para no reintentar
    // en vano; un error transitorio sí deja la fila sin procesar (break arriba).
    await db
      .from("ventas_sii")
      .update({ forma_pago, term_pago_dias, fecha_vencimiento, venc_procesado: true })
      .eq("id", f.id);
    procesadas++;
  }

  const { count } = await db
    .from("ventas_sii")
    .select("id", { count: "exact", head: true })
    .in("tipo_doc", [33, 34, 56])
    .eq("venc_procesado", false)
    .not("fecha_emision", "is", null);

  return { procesadas, conVencimiento, restantes: count ?? 0 };
}
