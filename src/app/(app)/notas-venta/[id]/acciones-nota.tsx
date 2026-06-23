"use client";

import { useState, useTransition } from "react";
import { marcarPagada, anularNotaVenta, eliminarNotaVenta } from "../actions";

export function AccionesNota({
  notaVentaId,
  estado,
}: {
  notaVentaId: string;
  estado: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function pagar() {
    if (!confirm("¿Marcar esta nota de venta como pagada?")) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await marcarPagada(notaVentaId);
      if (result?.error) {
        setError(result.error);
      }
    });
  }

  function anular() {
    if (!confirm("¿Anular esta nota de venta? Esta acción es definitiva.")) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await anularNotaVenta(notaVentaId);
      if (result?.error) {
        setError(result.error);
      }
    });
  }

  function eliminar() {
    if (
      !confirm(
        "¿Eliminar definitivamente esta nota de venta? Se borrará junto con sus ítems y no se podrá recuperar."
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      // En éxito el servidor redirige a /notas-venta; solo llega result si falla.
      const result = await eliminarNotaVenta(notaVentaId);
      if (result?.error) {
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={eliminar}
          disabled={isPending}
          className="rounded-md border border-red-600 bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
        >
          {isPending ? "Procesando…" : "Eliminar"}
        </button>
        {estado === "pendiente" && (
          <>
            <button
              type="button"
              onClick={anular}
              disabled={isPending}
              className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
            >
              {isPending ? "Procesando…" : "Anular"}
            </button>
            <button
              type="button"
              onClick={pagar}
              disabled={isPending}
              className="rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-50"
            >
              {isPending ? "Procesando…" : "Marcar pagada"}
            </button>
          </>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
