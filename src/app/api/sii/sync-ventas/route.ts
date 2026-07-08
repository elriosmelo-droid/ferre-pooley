import { NextResponse } from "next/server";
import { sincronizarVentas } from "@/lib/sii/sync";
import { precachearVencimientos } from "@/lib/sii/precache-vencimientos";

// Sync del RCV de ventas: baja las facturas emitidas del SII, las upserta en
// `ventas_sii` y las vincula con notas de venta. Cron de Vercel (vercel.json)
// o manual con ?secret=... . Protegido por SII_SYNC_SECRET. Va separado del de
// compras porque cada descarga tarda ~4min.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

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

  try {
    const { periodos, encontradas, guardadas, vinculadas } =
      await sincronizarVentas();

    // Tras el sync, completa plazos/vencimientos de las facturas nuevas
    // (acotado; lo que no alcance lo toma la corrida siguiente).
    let vencimientos = 0;
    try {
      const venc = await precachearVencimientos();
      vencimientos = venc.conVencimiento;
    } catch (e) {
      console.error("Precache de vencimientos en el cron de ventas falló:", e);
    }

    return NextResponse.json({
      ok: true,
      periodos,
      encontradas,
      guardadas,
      vinculadas,
      vencimientos,
    });
  } catch (err) {
    console.error("Error en el sync de ventas del SII:", err);
    const msg = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
