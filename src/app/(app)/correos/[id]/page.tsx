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
};

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
    .select("id, de, para, asunto, texto, html, adjuntos, recibido_at, leido")
    .eq("id", id)
    .maybeSingle();

  if (!data) notFound();
  const correo = data as Correo;

  // Marcar como leído al abrir (el badge se actualiza en la próxima navegación).
  if (!correo.leido) {
    await supabase.from("correos").update({ leido: true }).eq("id", id);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/correos"
        className="text-sm text-slate-500 hover:text-slate-700"
      >
        ← Correos
      </Link>

      <div className="mt-2 rounded-xl border border-slate-200 bg-white p-6">
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
              <span
                key={a.id}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600"
                title={a.content_type}
              >
                📎 {a.filename}
                {a.size ? ` · ${tamano(a.size)}` : ""}
              </span>
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
