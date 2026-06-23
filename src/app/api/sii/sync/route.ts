import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { descargarCompras } from "@/lib/sii/rcv";

// Sync horario del RCV: baja las facturas de compra del SII y las upserta en
// `compras_sii`. Lo invoca el cron de Vercel (ver vercel.json) o manualmente
// con ?secret=... . Protegido por SII_SYNC_SECRET.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// 'AAAAMM' del mes con offset (0 = mes actual, -1 = mes anterior).
function periodoConOffset(offset: number): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function autorizado(request: Request): boolean {
  const secret = process.env.SII_SYNC_SECRET;
  if (!secret) return false;
  const url = new URL(request.url);
  const fromQuery = url.searchParams.get("secret");
  const fromHeader = request.headers.get("authorization")?.replace("Bearer ", "");
  return fromQuery === secret || fromHeader === secret;
}

export async function GET(request: Request) {
  if (!autorizado(request)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // Mes actual + anterior: las facturas pueden registrarse con retraso.
  const periodos = [periodoConOffset(0), periodoConOffset(-1)];

  try {
    const compras = await descargarCompras(periodos);

    if (compras.length === 0) {
      return NextResponse.json({ ok: true, periodos, encontradas: 0, guardadas: 0 });
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
      return NextResponse.json(
        { error: "No se pudieron guardar las compras." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      periodos,
      encontradas: compras.length,
      guardadas: filas.length,
    });
  } catch (err) {
    console.error("Error en el sync del SII:", err);
    const msg = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
