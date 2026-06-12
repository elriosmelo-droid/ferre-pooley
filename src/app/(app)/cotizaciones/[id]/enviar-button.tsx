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
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
      >
        {isPending ? "Enviando…" : "Enviar al cliente"}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
