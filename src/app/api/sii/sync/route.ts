import { NextResponse } from "next/server";
import { sincronizarCompras } from "@/lib/sii/sync";

// Sync horario del RCV: baja las facturas de compra del SII y las upserta en
// `compras_sii`. Lo invoca el cron de Vercel (ver vercel.json) o manualmente
// con ?secret=... . Protegido por SII_SYNC_SECRET.
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
    const { periodos, encontradas, guardadas } = await sincronizarCompras();
    return NextResponse.json({ ok: true, periodos, encontradas, guardadas });
  } catch (err) {
    console.error("Error en el sync del SII:", err);
    const msg = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
