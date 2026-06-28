"use client";

import { useState, useTransition } from "react";
import { generarPdfsCompras } from "./actions";

export function GenerarPdfsButton() {
  const [isPending, startTransition] = useTransition();
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function generar() {
    setMensaje(null);
    setError(null);
    startTransition(async () => {
      const result = await generarPdfsCompras();
      if (result.error) {
        setError(result.error);
        return;
      }
      const partes = [`${result.generados ?? 0} PDF generados`];
      if (result.pendientes) partes.push(`${result.pendientes} pendientes`);
      if (result.rateLimited) partes.push("SII cortó por límite, reintenta en un rato");
      setMensaje(`Listo: ${partes.join(" · ")}.`);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={generar}
        disabled={isPending}
        className="rounded-md border border-brand-600 px-4 py-2 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-50 disabled:opacity-50"
      >
        {isPending ? "Generando PDFs…" : "Generar PDFs"}
      </button>
      {mensaje && <p className="text-xs text-green-600">{mensaje}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
