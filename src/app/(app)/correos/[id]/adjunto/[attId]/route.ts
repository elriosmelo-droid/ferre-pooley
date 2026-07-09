import { createClient } from "@/lib/supabase/server";
import { getPerfilActual } from "@/lib/auth/rol";

export const maxDuration = 60;

// Descarga un adjunto de un correo recibido: pide a Resend la URL firmada del
// adjunto y sirve los bytes con el nombre original. Guardado por membresía.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; attId: string }> }
) {
  const perfil = await getPerfilActual();
  if (!perfil) return new Response("No autorizado", { status: 401 });

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return new Response("Resend no configurado", { status: 500 });

  const { id, attId } = await params;
  const supabase = await createClient();

  const { data: correo } = await supabase
    .from("correos")
    .select("resend_id, adjuntos")
    .eq("id", id)
    .maybeSingle();

  if (!correo) return new Response("Correo no encontrado", { status: 404 });

  // El adjunto pedido debe pertenecer a este correo.
  const adjuntos = (correo.adjuntos ?? []) as { id: string; filename?: string }[];
  const adj = adjuntos.find((a) => a.id === attId);
  if (!adj) return new Response("Adjunto no encontrado", { status: 404 });

  // 1. Metadata + URL firmada del adjunto.
  const metaResp = await fetch(
    `https://api.resend.com/emails/receiving/${correo.resend_id}/attachments/${attId}`,
    { headers: { Authorization: `Bearer ${apiKey}` } }
  );
  if (!metaResp.ok) {
    console.error("Resend adjunto meta falló:", metaResp.status);
    return new Response("No se pudo obtener el adjunto", { status: 502 });
  }
  const meta = (await metaResp.json()) as {
    download_url?: string;
    filename?: string;
    content_type?: string;
  };
  if (!meta.download_url) {
    return new Response("El adjunto no tiene URL de descarga", { status: 502 });
  }

  // 2. Bajar el contenido de la URL firmada (no requiere auth).
  const fileResp = await fetch(meta.download_url);
  if (!fileResp.ok) {
    console.error("Descarga de adjunto falló:", fileResp.status);
    return new Response("No se pudo descargar el adjunto", { status: 502 });
  }
  const buf = Buffer.from(await fileResp.arrayBuffer());
  const nombre = (meta.filename || adj.filename || "adjunto").replace(/"/g, "");

  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": meta.content_type || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${nombre}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
