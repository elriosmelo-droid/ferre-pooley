import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type Adjunto = { id: string; filename: string; content_type?: string; size?: number };

type Correo = {
  id: string;
  de: string | null;
  para: string[];
  asunto: string | null;
  texto: string | null;
  html: string | null;
  adjuntos: Adjunto[];
  recibido_at: string;
  leido: boolean;
  direccion: "entrante" | "saliente";
};

// Extrae el email de un "Nombre <email@x>" o devuelve el texto si ya es email.
function soloEmail(de: string | null): string {
  if (!de) return "";
  return de.match(/<([^>]+)>/)?.[1] ?? de.trim();
}

function fmtFechaHora(iso: string) {
  return new Date(iso).toLocaleString("es-CL", {
    timeZone: "America/Santiago",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function tamano(bytes?: number) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default async function CorreoDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .from("correos")
    .select("id, de, para, asunto, texto, html, adjuntos, recibido_at, leido, direccion")
    .eq("id", id)
    .maybeSingle();

  if (!data) notFound();
  const correo = data as Correo;
  const esEntrante = correo.direccion === "entrante";
  const volver = esEntrante ? "/correos" : "/correos/enviados";

  // Marcar como leído al abrir (solo entrantes; el badge se actualiza en la
  // próxima navegación).
  if (esEntrante && !correo.leido) {
    await supabase.from("correos").update({ leido: true }).eq("id", id);
  }

  const responderHref = `/correos/nuevo?para=${encodeURIComponent(
    soloEmail(correo.de)
  )}&asunto=${encodeURIComponent(
    correo.asunto?.startsWith("Re:") ? correo.asunto : `Re: ${correo.asunto ?? ""}`
  )}`;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between">
        <Link href={volver} className="text-sm text-slate-500 hover:text-slate-700">
          ← {esEntrante ? "Recibidos" : "Enviados"}
        </Link>
        {esEntrante && (
          <Link
            href={responderHref}
            className="inline-flex items-center gap-2 rounded-md bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 17l-5-5 5-5M4 12h11a5 5 0 0 1 5 5v1" />
            </svg>
            Responder
          </Link>
        )}
      </div>

      <div className="mt-2 rounded-xl border border-slate-200 bg-white p-6">
        {!esEntrante && (
          <span className="mb-2 inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
            Enviado
          </span>
        )}
        <h1 className="text-xl font-bold text-slate-900">
          {correo.asunto || "(sin asunto)"}
        </h1>
        <div className="mt-2 flex flex-col gap-0.5 text-sm text-slate-600">
          <p>
            <span className="font-medium text-slate-500">De: </span>
            {correo.de ?? "—"}
          </p>
          <p>
            <span className="font-medium text-slate-500">Para: </span>
            {correo.para.join(", ") || "—"}
          </p>
          <p className="text-xs text-slate-400">{fmtFechaHora(correo.recibido_at)}</p>
        </div>

        {correo.adjuntos.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            {correo.adjuntos.map((a) => (
              <a
                key={a.id}
                href={`/correos/${correo.id}/adjunto/${a.id}`}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
                title={`Descargar ${a.filename}`}
              >
                📎 {a.filename}
                {a.size ? ` · ${tamano(a.size)}` : ""}
              </a>
            ))}
          </div>
        )}

        <div className="mt-4 border-t border-slate-100 pt-4">
          {correo.html ? (
            // Sandbox sin scripts: aísla el HTML del correo (evita XSS).
            <iframe
              title="Contenido del correo"
              sandbox=""
              srcDoc={correo.html}
              className="h-[600px] w-full rounded-md border border-slate-200 bg-white"
            />
          ) : (
            <pre className="whitespace-pre-wrap font-sans text-sm text-slate-700">
              {correo.texto || "(sin contenido)"}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
