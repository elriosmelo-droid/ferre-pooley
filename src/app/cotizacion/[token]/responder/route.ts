import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarCorreo } from "@/lib/email/send";
import { AvisoRespuestaEmail } from "@/lib/email/aviso-respuesta-email";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const bodySchema = z.object({
  accion: z.enum(["aceptar", "rechazar"]),
});

async function enviarAvisoInterno(
  supabase: ReturnType<typeof createAdminClient>,
  token: string,
  aceptada: boolean,
  notaVentaFolio: string | null
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
    const linkNotasVenta = process.env.NEXT_PUBLIC_APP_URL
      ? `${process.env.NEXT_PUBLIC_APP_URL}/notas-venta`
      : null;

    await enviarCorreo({
      para: perfil.correo_aviso,
      asunto,
      react: AvisoRespuestaEmail({
        folio: cot.folio,
        clienteNombre: cot.clientes?.nombre ?? "Cliente",
        aceptada,
        notaVentaFolio,
        linkNotasVenta,
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
  const { data, error } = await supabase.rpc("responder_cotizacion", {
    p_token: token,
    p_aceptar: parsed.data.accion === "aceptar",
  });

  if (error) {
    console.error("Error en responder_cotizacion:", error);
    return NextResponse.json(
      { error: "No se pudo procesar la respuesta." },
      { status: 500 }
    );
  }

  const fila = (Array.isArray(data) ? data[0] : data) as
    | { resultado: string; nota_venta_folio: string | null }
    | undefined;

  if (!fila) {
    return NextResponse.json(
      { error: "No se pudo procesar la respuesta." },
      { status: 500 }
    );
  }

  // Solo avisar cuando hubo transición real: una aceptación siempre trae el
  // folio de la nota de venta; una cotización ya aceptada antes lo trae null.
  if (
    (fila.resultado === "aceptada" && fila.nota_venta_folio) ||
    fila.resultado === "rechazada"
  ) {
    await enviarAvisoInterno(
      supabase,
      token,
      fila.resultado === "aceptada",
      fila.nota_venta_folio
    );
  }

  return NextResponse.json({
    resultado: fila.resultado,
    nota_venta_folio: fila.nota_venta_folio,
  });
}
