"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { enviarCorreoTexto } from "@/lib/email/send";
import { getPerfilActual } from "@/lib/auth/rol";

// Remitente según el usuario que envía: Victor sale con su casilla; el resto
// con la casilla de ventas.
const REMITENTES: Record<string, string> = {
  "vpooleyf@outlook.com": "Victor Pooley <vpooley@tulbless.cl>",
};
const REMITENTE_DEFAULT = "Ventas Tulbless <ventas@tulbless.cl>";

export type EnviarCorreoState = {
  error?: string;
  success?: boolean;
  fieldErrors?: Partial<Record<"para" | "asunto" | "cuerpo", string[]>>;
};

const schema = z.object({
  para: z.email("Ingresa un correo de destino válido"),
  asunto: z.string().trim().min(1, "Ingresa un asunto"),
  cuerpo: z.string().trim().min(1, "Escribe un mensaje"),
});

export async function enviarCorreoNuevo(
  _prev: EnviarCorreoState,
  formData: FormData
): Promise<EnviarCorreoState> {
  const parsed = schema.safeParse({
    para: String(formData.get("para") ?? "").trim(),
    asunto: String(formData.get("asunto") ?? ""),
    cuerpo: String(formData.get("cuerpo") ?? ""),
  });
  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }

  const perfil = await getPerfilActual();
  const from =
    (perfil?.email && REMITENTES[perfil.email]) || REMITENTE_DEFAULT;

  let enviado: { id: string; from: string };
  try {
    enviado = await enviarCorreoTexto({ ...parsed.data, from });
  } catch (e) {
    console.error("Error al enviar correo:", e);
    return {
      error: "No se pudo enviar el correo. Revisa la configuración de Resend.",
    };
  }

  // Guarda en la bandeja de Enviados. Si falla el guardado, el correo igual se
  // envió; se registra el error sin romper la respuesta.
  const supabase = await createClient();
  const { error } = await supabase.from("correos").insert({
    resend_id: enviado.id,
    de: enviado.from,
    para: [parsed.data.para],
    asunto: parsed.data.asunto,
    texto: parsed.data.cuerpo,
    direccion: "saliente",
    leido: true,
  });
  if (error) {
    console.error("Correo enviado pero no se guardó en Enviados:", error.message);
  }

  revalidatePath("/correos/enviados");
  return { success: true };
}
