import { createAdminClient } from "@/lib/supabase/admin";
import { descargarDteRecibido } from "@/lib/sii/mipe";
import { parseDte } from "@/lib/sii/dte-xml";
import { generarPdfFacturaRecibida } from "@/lib/pdf/venta-pdf";

export const maxDuration = 60;

const BUCKET = "compras-pdf";

function pdfResponse(buf: Buffer, folio: string) {
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="compra-${folio}.pdf"`,
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

  const { data: compra, error } = await db
    .from("compras_sii")
    .select("id, folio, tipo_doc, fecha_emision")
    .eq("id", id)
    .single();
  if (error || !compra) {
    return new Response("Compra no encontrada", { status: 404 });
  }

  const key = `${id}.pdf`;

  // 1. Caché
  const cached = await db.storage.from(BUCKET).download(key);
  if (cached.data) {
    const buf = Buffer.from(await cached.data.arrayBuffer());
    return pdfResponse(buf, compra.folio);
  }

  // 2. Miss → bajar el DTE recibido del SII
  if (!compra.fecha_emision) {
    return new Response("La compra no tiene fecha de emisión", { status: 422 });
  }
  let resultado;
  try {
    resultado = await descargarDteRecibido({
      fecha: compra.fecha_emision,
      folio: compra.folio,
      tipoDoc: compra.tipo_doc,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    const status = msg.includes("429") ? 503 : 502;
    return new Response(`No se pudo obtener el DTE del SII: ${msg}`, { status });
  }
  if ("motivo" in resultado) {
    if (resultado.motivo === "no_en_mipe") {
      // El proveedor no entrega este documento por el sistema gratuito del SII:
      // el SII no tiene copia que darnos, no se puede descargar el detalle.
      return new Response(
        "Este documento no se puede descargar: el proveedor no lo entrega por el sistema gratuito del SII, así que el SII no tiene el detalle. Pídele el XML al proveedor si lo necesitas.",
        { status: 404 }
      );
    }
    // "vacio": probable límite del SII; reintentar o usar "Generar PDFs".
    return new Response(
      "No se pudo obtener el detalle ahora (el SII no respondió documentos, probable límite por consultas). Reintenta en unos minutos o usa “Generar PDFs”.",
      { status: 503 }
    );
  }

  const buf = await generarPdfFacturaRecibida(parseDte(resultado.xml));

  // 3. Cachear (best-effort)
  const up = await db.storage
    .from(BUCKET)
    .upload(key, new Uint8Array(buf), { contentType: "application/pdf", upsert: true });
  if (up.error) console.error("No se pudo cachear el PDF de compra:", up.error.message);

  return pdfResponse(buf, compra.folio);
}
