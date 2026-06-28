"use client";

import { useState, useTransition } from "react";
import { actualizarCompras } from "./actions";

export function ActualizarComprasButton() {
  const [isPending, startTransition] = useTransition();
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function actualizar() {
    setMensaje(null);
    setError(null);
    startTransition(async () => {
      const result = await actualizarCompras();
      if (result.error) {
        setError(result.error);
        return;
      }
      const pdfs = result.pdfsGenerados
        ? ` · ${result.pdfsGenerados} PDF generados`
        : "";
      setMensaje(
        result.encontradas
          ? `Listo: ${result.guardadas} compras actualizadas${pdfs}.`
          : `No se encontraron compras nuevas en el SII${pdfs}.`
      );
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={actualizar}
        disabled={isPending}
        className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
      >
        {isPending ? "Actualizando…" : "Actualizar compras"}
      </button>
      {mensaje && <p className="text-xs text-green-600">{mensaje}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
