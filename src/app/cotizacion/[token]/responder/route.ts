import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarCorreo } from "@/lib/email/send";
import { AvisoRespuestaEmail } from "@/lib/email/aviso-respuesta-email";
import { APP_URL } from "@/lib/app-url";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const bodySchema = z
  .object({
    accion: z.enum(["aceptar", "rechazar"]),
    // Solo se exigen al aceptar; data URL PNG de la firma y nombre del firmante.
    firma: z.string().startsWith("data:image/").max(2_000_000).optional(),
    firmante: z.string().trim().min(1).max(120).optional(),
    // Comentario opcional del cliente al rechazar.
    motivo: z.string().trim().max(1000).optional(),
  })
  .refine((b) => b.accion !== "aceptar" || (b.firma && b.firmante), {
    message: "La aceptación requiere firma y nombre.",
  });

async function enviarAvisoInterno(
  supabase: ReturnType<typeof createAdminClient>,
  token: string,
  aceptada: boolean,
  notaVentaFolio: string | null,
  motivo: string | null
) {
  try {
    const { data: perfil } = await supabase
      .from("perfiles")
      .select("correo_aviso")
      .limit(1)
      .maybeSingle();

    if (!perfil?.correo_aviso) {
      console.warn(
        "Aviso de respuesta no enviado: no hay correo_aviso configurado en el perfil."
      );
      return;
    }

    const { data: cotizacion } = await supabase
      .from("cotizaciones")
      .select("folio, clientes(nombre)")
      .eq("token_aceptacion", token)
      .maybeSingle();

    if (!cotizacion) {
      console.warn("Aviso de respuesta no enviado: cotización no encontrada.");
      return;
    }

    const cot = cotizacion as unknown as {
      folio: string;
      clientes: { nombre: string } | null;
    };

    const asunto = aceptada
      ? `Cotización ${cot.folio} ACEPTADA — Nota de venta ${notaVentaFolio}`
      : `Cotización ${cot.folio} RECHAZADA`;
    const linkNotasVenta = `${APP_URL}/notas-venta`;

    await enviarCorreo({
      para: perfil.correo_aviso,
      asunto,
      react: AvisoRespuestaEmail({
        folio: cot.folio,
        clienteNombre: cot.clientes?.nombre ?? "Cliente",
        aceptada,
        notaVentaFolio,
        linkNotasVenta,
        motivo,
      }),
    });
  } catch (err) {
    // El aviso interno nunca debe hacer fallar la respuesta del cliente.
    console.error("Error al enviar el aviso interno de respuesta:", err);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  if (!UUID_REGEX.test(token)) {
    return NextResponse.json(
      { error: "Cotización no encontrada." },
      { status: 404 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Acción inválida. Usa "aceptar" o "rechazar".' },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();
  const esAceptar = parsed.data.accion === "aceptar";
  const { data, error } = await supabase.rpc("responder_cotizacion", {
    p_token: token,
    p_aceptar: esAceptar,
    p_firma: esAceptar ? (parsed.data.firma ?? null) : null,
    p_firmante: esAceptar ? (parsed.data.firmante ?? null) : null,
    p_motivo: esAceptar ? null : (parsed.data.motivo ?? null),
  });

  if (error) {
    console.error("Error en responder_cotizacion:", error);
    return NextResponse.json(
      { error: "No se pudo procesar la respuesta." },
      { status: 500 }
    );
  }

  const fila = (Array.isArray(data) ? data[0] : data) as
    | { resultado: string; nota_venta_folio: string | null; transicion: boolean }
    | undefined;

  if (!fila) {
    return NextResponse.json(
      { error: "No se pudo procesar la respuesta." },
      { status: 500 }
    );
  }

  // Solo avisar cuando hubo transición real: la función devuelve
  // transicion=false en replays (token ya respondido), evitando reenvíos.
  if (
    fila.transicion &&
    (fila.resultado === "aceptada" || fila.resultado === "rechazada")
  ) {
    await enviarAvisoInterno(
      supabase,
      token,
      fila.resultado === "aceptada",
      fila.nota_venta_folio,
      fila.resultado === "rechazada" ? (parsed.data.motivo ?? null) : null
    );
  }

  return NextResponse.json({
    resultado: fila.resultado,
    nota_venta_folio: fila.nota_venta_folio,
  });
}
