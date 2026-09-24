"use client";

import { useState, useTransition } from "react";
import { eliminarProducto } from "./actions";

export function EliminarProductoButton({
  id,
  sku,
}: {
  id: string;
  sku: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onEliminar() {
    if (
      !confirm(
        `¿Eliminar el producto ${sku}? Las cotizaciones y órdenes que lo usan no cambian. Esta acción no se puede deshacer.`
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await eliminarProducto(id);
      if (res?.error) setError(res.error);
    });
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onEliminar}
        disabled={pending}
        className="text-sm font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
      >
        {pending ? "Eliminando…" : "Eliminar"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
