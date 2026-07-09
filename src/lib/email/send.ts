import { Resend } from "resend";
import { render } from "@react-email/render";
import type { ReactElement } from "react";

let resendClient: Resend | null = null;

function getResend(): Resend {
  if (!process.env.RESEND_API_KEY) {
    throw new Error(
      "RESEND_API_KEY no está configurada. Define la variable de entorno para poder enviar correos."
    );
  }
  if (!resendClient) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

export async function enviarCorreo({
  para,
  asunto,
  react,
}: {
  para: string;
  asunto: string;
  react: ReactElement;
}): Promise<void> {
  const from = process.env.RESEND_FROM;
  if (!from) {
    throw new Error(
      'RESEND_FROM no está configurada. Define la variable de entorno (p. ej. "Tulbless <onboarding@resend.dev>").'
    );
  }

  // Renderizamos a HTML aquí en vez de pasar `react`: así no dependemos de que
  // Resend resuelva @react-email/render dentro del bundle serverless.
  const html = await render(react);

  const { error } = await getResend().emails.send({
    from,
    to: para,
    subject: asunto,
    html,
  });

  if (error) {
    throw new Error(`Resend rechazó el envío: ${error.message}`);
  }
}

// Envía un correo de texto plano (redactado desde la app). Devuelve el id de
// Resend y el remitente usado, para guardarlo en la bandeja de Enviados.
export async function enviarCorreoTexto({
  para,
  asunto,
  cuerpo,
}: {
  para: string;
  asunto: string;
  cuerpo: string;
}): Promise<{ id: string; from: string }> {
  const from = process.env.RESEND_FROM;
  if (!from) {
    throw new Error("RESEND_FROM no está configurada.");
  }

  const { data, error } = await getResend().emails.send({
    from,
    to: para,
    subject: asunto,
    text: cuerpo,
  });

  if (error || !data) {
    throw new Error(`Resend rechazó el envío: ${error?.message ?? "sin id"}`);
  }
  return { id: data.id, from };
}

export async function enviarCorreoCotizacion({
  para,
  asunto,
  react,
  adjuntoPdf,
  nombreAdjunto,
}: {
  para: string;
  asunto: string;
  react: ReactElement;
  adjuntoPdf: Buffer;
  nombreAdjunto: string;
}): Promise<void> {
  const from = process.env.RESEND_FROM;
  if (!from) {
    throw new Error(
      'RESEND_FROM no está configurada. Define la variable de entorno (p. ej. "Tulbless <onboarding@resend.dev>").'
    );
  }

  const html = await render(react);

  const { error } = await getResend().emails.send({
    from,
    to: para,
    subject: asunto,
    html,
    attachments: [{ filename: nombreAdjunto, content: adjuntoPdf }],
  });

  if (error) {
    throw new Error(`Resend rechazó el envío: ${error.message}`);
  }
}
