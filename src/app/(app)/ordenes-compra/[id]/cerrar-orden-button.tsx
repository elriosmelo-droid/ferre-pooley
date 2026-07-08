"use client";

import { useState, useTransition } from "react";
import { cerrarOrden } from "../actions";

export function CerrarOrdenButton({ ordenId }: { ordenId: string }) {
  const [abierto, setAbierto] = useState(false);
  const [observacion, setObservacion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function cerrar() {
    setError(null);
    startTransition(async () => {
      const res = await cerrarOrden(ordenId, observacion);
      if (res.error) {
        setError(res.error);
        return;
      }
      setAbierto(false);
    });
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
      >
        Cerrar orden
      </button>
    );
  }

  return (
    <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-4">
      <label
        htmlFor="observacion_cierre"
        className="mb-1 block text-sm font-medium text-slate-700"
      >
        Observación de cierre *
      </label>
      <textarea
        id="observacion_cierre"
        value={observacion}
        onChange={(e) => setObservacion(e.target.value)}
        rows={3}
        autoFocus
        placeholder="Ej: recibido completo, conforme a la orden."
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
      />
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={cerrar}
          disabled={pending}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
        >
          {pending ? "Cerrando…" : "Confirmar cierre"}
        </button>
        <button
          type="button"
          onClick={() => {
            setAbierto(false);
            setError(null);
          }}
          className="rounded-md px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
