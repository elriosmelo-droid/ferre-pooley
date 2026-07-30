"use client";

import { useState, useTransition } from "react";
import { reenviarOrdenCompra } from "../actions";

// Reenvía el PDF corregido al proveedor. Se muestra en órdenes enviadas; queda
// destacado cuando la orden se editó después del envío original.
export function ReenviarButton({
  ordenId,
  destacado,
}: {
  ordenId: string;
  destacado: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);

  function reenviar() {
    if (
      !confirm(
        "¿Reenviar la orden corregida al proveedor? Recibirá un correo indicando que reemplaza la versión anterior."
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await reenviarOrdenCompra(ordenId);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setEnviado(true);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={reenviar}
        disabled={isPending || enviado}
        className={
          destacado
            ? "rounded-md bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
            : "rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
        }
      >
        {isPending
          ? "Reenviando…"
          : enviado
            ? "Reenviada ✓"
            : "Reenviar al proveedor"}
      </button>
      {error && (
        <div className="flex flex-col items-end gap-1">
          <p className="max-w-xs text-right text-xs text-red-600">{error}</p>
          <a
            href={`/ordenes-compra/${ordenId}/pdf`}
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
