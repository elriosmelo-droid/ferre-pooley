"use client";

import { useOptimistic, useState, useTransition } from "react";
import { marcarEntregado } from "../actions";

// Check de entregado de un ítem. Optimista: se marca al instante y vuelve
// atrás si el servidor rechaza.
export function EntregaCheck({
  notaVentaId,
  itemId,
  entregado,
  entregadoAt,
  soloLectura,
}: {
  notaVentaId: string;
  itemId: string;
  entregado: boolean;
  entregadoAt: string | null;
  soloLectura: boolean;
}) {
  const [optimista, setOptimista] = useOptimistic(entregado);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const titulo = entregadoAt
    ? `Entregado el ${new Date(entregadoAt).toLocaleDateString("es-CL", { timeZone: "America/Santiago" })}`
    : "Sin entregar";

  function onChange(valor: boolean) {
    setError(null);
    startTransition(async () => {
      setOptimista(valor);
      const r = await marcarEntregado(notaVentaId, [itemId], valor);
      if (r.error) setError(r.error);
    });
  }

  return (
    <label className="inline-flex flex-col items-center gap-1" title={titulo}>
      <input
        type="checkbox"
        checked={optimista}
        disabled={soloLectura}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={titulo}
        className="h-5 w-5 cursor-pointer rounded border-slate-300 text-green-600 focus:ring-green-500 disabled:cursor-default"
      />
      {error && <span className="text-xs text-red-600">{error}</span>}
    </label>
  );
}

// Resumen y acción masiva sobre todos los ítems de la nota.
export function EntregaResumen({
  notaVentaId,
  items,
  soloLectura,
}: {
  notaVentaId: string;
  items: { id: string; entregado: boolean }[];
  soloLectura: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const pendientes = items.filter((i) => !i.entregado);

  function marcarTodo(valor: boolean) {
    setError(null);
    const ids = (valor ? pendientes : items).map((i) => i.id);
    startTransition(async () => {
      const r = await marcarEntregado(notaVentaId, ids, valor);
      if (r.error) setError(r.error);
    });
  }

  if (items.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      {pendientes.length === 0 ? (
        <span className="rounded-full bg-green-100 px-3 py-1 font-medium text-green-800">
          Todo entregado
        </span>
      ) : (
        <span className="rounded-full bg-amber-100 px-3 py-1 font-medium text-amber-800">
          {pendientes.length} de {items.length} ítem{items.length === 1 ? "" : "s"} sin entregar
        </span>
      )}
      {!soloLectura && (
        <button
          type="button"
          disabled={pending}
          onClick={() => marcarTodo(pendientes.length > 0)}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
        >
          {pending
            ? "Guardando…"
            : pendientes.length > 0
              ? "Marcar todo entregado"
              : "Desmarcar todo"}
        </button>
      )}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
