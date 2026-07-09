"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { enviarCorreoTexto } from "@/lib/email/send";

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

  let enviado: { id: string; from: string };
  try {
    enviado = await enviarCorreoTexto(parsed.data);
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
