import { createAdminClient } from "@/lib/supabase/admin";
import { descargarDteEmitidoXml } from "@/lib/sii/mipe";
import { parseDte } from "@/lib/sii/dte-xml";
import { generarPdfVenta } from "@/lib/pdf/venta-pdf";

export const maxDuration = 60;

const BUCKET = "ventas-pdf";

function pdfResponse(buf: Buffer, folio: string) {
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="venta-${folio}.pdf"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createAdminClient();

  const { data: venta, error } = await db
    .from("ventas_sii")
    .select("id, folio, tipo_doc, fecha_emision")
    .eq("id", id)
    .single();
  if (error || !venta) {
    return new Response("Venta no encontrada", { status: 404 });
  }

  const key = `${id}.pdf`;

  // 1. Caché
  const cached = await db.storage.from(BUCKET).download(key);
  if (cached.data) {
    const buf = Buffer.from(await cached.data.arrayBuffer());
    return pdfResponse(buf, venta.folio);
  }

  // 2. Miss → bajar del SII
  if (!venta.fecha_emision) {
    return new Response("La venta no tiene fecha de emisión", { status: 422 });
  }
  let xml: string | null;
  try {
    xml = await descargarDteEmitidoXml({
      fecha: venta.fecha_emision,
      folio: venta.folio,
      tipoDoc: venta.tipo_doc,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    const status = msg.includes("429") ? 503 : 502;
    return new Response(`No se pudo obtener el DTE del SII: ${msg}`, { status });
  }
  if (!xml) {
    return new Response("No se encontró el DTE en el SII", { status: 404 });
  }

  const buf = await generarPdfVenta(parseDte(xml));

  // 3. Cachear (best-effort; si el bucket no existe, igual se sirve)
  const up = await db.storage
    .from(BUCKET)
    .upload(key, new Uint8Array(buf), { contentType: "application/pdf", upsert: true });
  if (up.error) console.error("No se pudo cachear el PDF en Storage:", up.error.message);

  return pdfResponse(buf, venta.folio);
}
