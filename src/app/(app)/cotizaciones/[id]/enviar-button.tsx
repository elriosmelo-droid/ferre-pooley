"use client";

import { useState, useTransition } from "react";
import { enviarCotizacion } from "../actions";

export function EnviarButton({ cotizacionId }: { cotizacionId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function enviar() {
    if (!confirm("¿Enviar la cotización al cliente?")) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await enviarCotizacion(cotizacionId);
      if (result?.error) {
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={enviar}
        disabled={isPending}
        className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
      >
        {isPending ? "Enviando…" : "Enviar al cliente"}
      </button>
      {error && (
        <div className="flex flex-col items-end gap-1">
          <p className="max-w-xs text-right text-xs text-red-600">{error}</p>
          <a
            href={`/cotizaciones/${cotizacionId}/pdf`}
            target="_blank"
            rel="noopener"
            className="text-xs font-semibold text-brand-600 underline hover:text-brand-800"
          >
            Ver PDF para enviarlo manual
          </a>
        </div>
      )}
    </div>
  );
}
