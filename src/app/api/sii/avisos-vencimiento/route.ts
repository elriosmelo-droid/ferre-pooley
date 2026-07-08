import { NextResponse } from "next/server";
import { createElement } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarCorreo } from "@/lib/email/send";
import { VencimientosEmail, type FacturaVencida } from "@/lib/email/vencimientos-email";
import { formatCLP } from "@/lib/money";
import { TIPO_DOC_CORTO } from "@/lib/dte-doc";

// Aviso diario a Victor de facturas vencidas e impagas. Una sola vez por
// factura (venc_notificado_at). Protegido por SII_SYNC_SECRET.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const VICTOR_EMAIL = "vpooleyf@outlook.com";

function autorizado(request: Request): boolean {
  const secret = process.env.SII_SYNC_SECRET;
  if (!secret) return false;
  const url = new URL(request.url);
  const fromQuery = url.searchParams.get("secret");
  const fromHeader = request.headers.get("authorization")?.replace("Bearer ", "");
  return fromQuery === secret || fromHeader === secret;
}

function hoySantiago(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
}

function fmtFecha(iso: string) {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}-${m}-${a}`;
}

function diasAtraso(vencimiento: string, hoy: string): number {
  const ms =
    new Date(`${hoy}T00:00:00Z`).getTime() -
    new Date(`${vencimiento}T00:00:00Z`).getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}

type VentaVencida = {
  id: string;
  tipo_doc: number;
  folio: string;
  razon_social: string | null;
  rut_cliente: string;
  monto_total: number;
  fecha_vencimiento: string;
  notas_venta: { estado: string } | { estado: string }[] | null;
};

function estadoNota(v: VentaVencida): string | null {
  const n = Array.isArray(v.notas_venta) ? v.notas_venta[0] : v.notas_venta;
  return n?.estado ?? null;
}

export async function GET(request: Request) {
  if (!autorizado(request)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const hoy = hoySantiago();
  const db = createAdminClient();

  const { data, error } = await db
    .from("ventas_sii")
    .select(
      "id, tipo_doc, folio, razon_social, rut_cliente, monto_total, fecha_vencimiento, notas_venta(estado)"
    )
    .in("tipo_doc", [33, 34, 56])
    .not("fecha_vencimiento", "is", null)
    .lt("fecha_vencimiento", hoy)
    .is("venc_notificado_at", null);

  if (error) {
    console.error("Error al leer vencimientos:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ventas = (data ?? []) as unknown as VentaVencida[];
  // Impaga: sin nota vinculada, o nota 'pendiente'. Pagada/anulada se excluyen.
  const impagas = ventas.filter((v) => {
    const e = estadoNota(v);
    return e === null || e === "pendiente";
  });

  if (impagas.length === 0) {
    return NextResponse.json({ ok: true, avisadas: 0 });
  }

  impagas.sort((a, b) => a.fecha_vencimiento.localeCompare(b.fecha_vencimiento));

  const facturas: FacturaVencida[] = impagas.map((v) => ({
    cliente: v.razon_social ?? v.rut_cliente,
    folio: v.folio,
    tipo: TIPO_DOC_CORTO[v.tipo_doc] ?? `T${v.tipo_doc}`,
    monto: formatCLP(v.monto_total),
    vencimiento: fmtFecha(v.fecha_vencimiento),
    diasAtraso: diasAtraso(v.fecha_vencimiento, hoy),
  }));
  const totalImpago = impagas.reduce((s, v) => s + v.monto_total, 0);

  try {
    await enviarCorreo({
      para: VICTOR_EMAIL,
      asunto: `Facturas vencidas e impagas (${impagas.length})`,
      react: createElement(VencimientosEmail, {
        facturas,
        totalImpago: formatCLP(totalImpago),
      }),
    });
  } catch (e) {
    console.error("Error al enviar aviso de vencimientos:", e);
    return NextResponse.json(
      { error: "No se pudo enviar el correo de aviso." },
      { status: 502 }
    );
  }

  // Marca como avisadas solo tras enviar el correo con éxito.
  await db
    .from("ventas_sii")
    .update({ venc_notificado_at: new Date().toISOString() })
    .in(
      "id",
      impagas.map((v) => v.id)
    );

  return NextResponse.json({ ok: true, avisadas: impagas.length });
}
