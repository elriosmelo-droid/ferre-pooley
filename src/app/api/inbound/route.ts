import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

// Webhook de Resend Inbound (evento email.received). Resend firma con Svix; el
// payload trae solo metadata, así que se baja el correo completo por la API.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Verifica la firma Svix del webhook con RESEND_WEBHOOK_SECRET (whsec_...).
function firmaValida(
  secret: string,
  id: string | null,
  timestamp: string | null,
  firmaHeader: string | null,
  body: string
): boolean {
  if (!id || !timestamp || !firmaHeader) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const esperado = crypto
    .createHmac("sha256", key)
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64");
  const esperadoBuf = Buffer.from(esperado);
  // El header trae "v1,<sig> v1,<sig>..."; basta que una coincida.
  return firmaHeader.split(" ").some((parte) => {
    const sig = parte.split(",")[1];
    if (!sig) return false;
    const sigBuf = Buffer.from(sig);
    return (
      sigBuf.length === esperadoBuf.length &&
      crypto.timingSafeEqual(sigBuf, esperadoBuf)
    );
  });
}

type ReceivedEmail = {
  from?: string;
  to?: string[];
  subject?: string | null;
  text?: string | null;
  html?: string | null;
  attachments?: { id: string; filename: string; content_type: string; size: number }[];
};

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  const apiKey = process.env.RESEND_API_KEY;
  if (!secret || !apiKey) {
    console.error("Falta RESEND_WEBHOOK_SECRET o RESEND_API_KEY");
    return NextResponse.json({ error: "No configurado" }, { status: 500 });
  }

  const body = await request.text();
  const ok = firmaValida(
    secret,
    request.headers.get("svix-id"),
    request.headers.get("svix-timestamp"),
    request.headers.get("svix-signature"),
    body
  );
  if (!ok) {
    return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
  }

  let evento: { type?: string; data?: { email_id?: string } };
  try {
    evento = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  if (evento.type !== "email.received" || !evento.data?.email_id) {
    // Otros eventos: se aceptan sin hacer nada.
    return NextResponse.json({ ok: true, ignorado: true });
  }

  const emailId = evento.data.email_id;

  // Baja el correo completo (cuerpo + adjuntos) de la API de Resend.
  const resp = await fetch(
    `https://api.resend.com/emails/receiving/${emailId}`,
    { headers: { Authorization: `Bearer ${apiKey}` } }
  );
  if (!resp.ok) {
    console.error("No se pudo bajar el correo de Resend:", resp.status);
    return NextResponse.json({ error: "No se pudo bajar el correo" }, { status: 502 });
  }
  const correo = (await resp.json()) as ReceivedEmail;

  const db = createAdminClient();
  const { error } = await db.from("correos").upsert(
    {
      resend_id: emailId,
      de: correo.from ?? null,
      para: correo.to ?? [],
      asunto: correo.subject ?? null,
      texto: correo.text ?? null,
      html: correo.html ?? null,
      adjuntos: correo.attachments ?? [],
    },
    { onConflict: "resend_id" }
  );

  if (error) {
    console.error("Error al guardar el correo entrante:", error.message);
    return NextResponse.json({ error: "No se pudo guardar" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
