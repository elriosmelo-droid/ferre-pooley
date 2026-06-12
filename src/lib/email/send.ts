import { Resend } from "resend";
import type { ReactNode } from "react";

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

export async function enviarCorreoCotizacion({
  para,
  asunto,
  react,
  adjuntoPdf,
  nombreAdjunto,
}: {
  para: string;
  asunto: string;
  react: ReactNode;
  adjuntoPdf: Buffer;
  nombreAdjunto: string;
}): Promise<void> {
  const from = process.env.RESEND_FROM;
  if (!from) {
    throw new Error(
      'RESEND_FROM no está configurada. Define la variable de entorno (p. ej. "Ferre Pooley <onboarding@resend.dev>").'
    );
  }

  const { error } = await getResend().emails.send({
    from,
    to: para,
    subject: asunto,
    react,
    attachments: [{ filename: nombreAdjunto, content: adjuntoPdf }],
  });

  if (error) {
    throw new Error(`Resend rechazó el envío: ${error.message}`);
  }
}
