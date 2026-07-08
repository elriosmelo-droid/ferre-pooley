import { NextResponse } from "next/server";
import { precachearVencimientos } from "@/lib/sii/precache-vencimientos";

// Backfill de plazos/vencimientos: baja los DTE de las facturas pendientes y
// guarda su vencimiento. Acotado por corrida; llamar en bucle para completar.
// Protegido por SII_SYNC_SECRET.
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
    const res = await precachearVencimientos();
    return NextResponse.json({ ok: true, ...res });
  } catch (err) {
    console.error("Error en precache de vencimientos:", err);
    const msg = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
