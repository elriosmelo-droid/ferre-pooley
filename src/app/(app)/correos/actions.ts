"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarCorreoTexto } from "@/lib/email/send";
import { SIN_PERMISO, checkPermiso, getPerfilActual } from "@/lib/auth/rol";
import { parseDestinatarios } from "@/lib/email/destinatarios";
import { htmlATexto, sanearHtml } from "@/lib/email/sanear-html";
import {
  BUCKET_ADJUNTOS,
  MAX_ADJUNTOS_BYTES,
  validarAdjuntos,
  type AdjuntoSubido,
} from "@/lib/email/adjuntos";

// Remitente según el usuario que envía: Victor sale con su casilla; el resto
// con la casilla de ventas.
const REMITENTES: Record<string, string> = {
  "vpooleyf@outlook.com": "Victor Pooley <vpooley@tulbless.cl>",
};
const REMITENTE_DEFAULT = "Ventas Tulbless <ventas@tulbless.cl>";

export type EnviarCorreoState = {
  error?: string;
  success?: boolean;
  fieldErrors?: Partial<
    Record<"para" | "cc" | "cco" | "asunto" | "cuerpo", string[]>
  >;
};

const adjuntoSchema = z.object({
  id: z.string().min(1),
  filename: z.string().min(1).max(200),
  size: z.number().int().positive(),
  content_type: z.string().max(150),
  ruta: z.string().min(1).max(500),
});

export async function enviarCorreoNuevo(
  _prev: EnviarCorreoState,
  formData: FormData
): Promise<EnviarCorreoState> {
  if (!(await checkPermiso("correos", "escritura"))) return { error: SIN_PERMISO };
  const perfil = await getPerfilActual();
  if (!perfil) return { error: SIN_PERMISO };

  const asunto = String(formData.get("asunto") ?? "").trim();
  const fieldErrors: NonNullable<EnviarCorreoState["fieldErrors"]> = {};

  const para = parseDestinatarios(String(formData.get("para") ?? ""));
  const cc = parseDestinatarios(String(formData.get("cc") ?? ""));
  const cco = parseDestinatarios(String(formData.get("cco") ?? ""));
  if (para.validos.length === 0 && para.invalidos.length === 0) {
    fieldErrors.para = ["Ingresa al menos un destinatario"];
  } else if (para.invalidos.length) {
    fieldErrors.para = [`Correo no válido: ${para.invalidos.join(", ")}`];
  }
  if (cc.invalidos.length) {
    fieldErrors.cc = [`Correo no válido: ${cc.invalidos.join(", ")}`];
  }
  if (cco.invalidos.length) {
    fieldErrors.cco = [`Correo no válido: ${cco.invalidos.join(", ")}`];
  }
  if (!asunto) fieldErrors.asunto = ["Ingresa un asunto"];

  // Adjuntos: solo rutas de la carpeta del propio usuario, para que nadie
  // pueda mandar por correo un archivo que subió otra persona.
  let adjuntos: AdjuntoSubido[] = [];
  try {
    const crudo = JSON.parse(String(formData.get("adjuntos") || "[]"));
    adjuntos = z.array(adjuntoSchema).parse(crudo);
  } catch {
    return { error: "Los adjuntos no son válidos. Vuelve a adjuntarlos." };
  }
  if (adjuntos.some((a) => !a.ruta.startsWith(`${perfil.userId}/`))) {
    return { error: "Uno de los adjuntos no te pertenece." };
  }
  const errAdj = validarAdjuntos(adjuntos);
  if (errAdj) return { error: errAdj };

  const html = sanearHtml(String(formData.get("cuerpo") ?? ""));
  const texto = htmlATexto(html);
  if (texto === "" && !/<img\b/i.test(html)) {
    fieldErrors.cuerpo = ["Escribe un mensaje"];
  }

  if (Object.keys(fieldErrors).length) return { fieldErrors };

  // Se bajan los archivos de Storage; el tamaño real manda sobre el declarado.
  const admin = createAdminClient();
  const archivos: { filename: string; content: Buffer }[] = [];
  let total = 0;
  for (const a of adjuntos) {
    const { data, error } = await admin.storage
      .from(BUCKET_ADJUNTOS)
      .download(a.ruta);
    if (error || !data) {
      return { error: `No se pudo leer el adjunto "${a.filename}". Vuelve a adjuntarlo.` };
    }
    const buf = Buffer.from(await data.arrayBuffer());
    total += buf.length;
    if (total > MAX_ADJUNTOS_BYTES) {
      return { error: "Los adjuntos superan los 25 MB en total." };
    }
    archivos.push({ filename: a.filename, content: buf });
  }

  const from =
    (perfil.email && REMITENTES[perfil.email]) || REMITENTE_DEFAULT;

  let enviado: { id: string; from: string };
  try {
    enviado = await enviarCorreoTexto({
      para: para.validos,
      cc: cc.validos,
      cco: cco.validos,
      asunto,
      html,
      texto,
      from,
      adjuntos: archivos,
    });
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
    para: para.validos,
    cc: cc.validos,
    cco: cco.validos,
    asunto,
    texto,
    html,
    adjuntos,
    direccion: "saliente",
    leido: true,
  });
  if (error) {
    console.error("Correo enviado pero no se guardó en Enviados:", error.message);
  }

  revalidatePath("/correos/enviados");
  return { success: true };
}
