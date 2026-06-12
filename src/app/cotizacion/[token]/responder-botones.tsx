"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ResponderBotones({ token }: { token: string }) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function responder(accion: "aceptar" | "rechazar") {
    const mensaje =
      accion === "aceptar"
        ? "¿Confirmar aceptación de la cotización?"
        : "¿Rechazar la cotización?";
    if (!confirm(mensaje)) {
      return;
    }
    setError(null);
    setIsPending(true);
    try {
      const res = await fetch(`/cotizacion/${token}/responder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion }),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      router.refresh();
    } catch (err) {
      console.error(err);
      setError("No se pudo procesar tu respuesta. Intenta nuevamente.");
      setIsPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 border-t border-slate-200 pt-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={() => responder("rechazar")}
          disabled={isPending}
          className="rounded-md border border-red-300 bg-white px-5 py-2.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50"
        >
          Rechazar
        </button>
        <button
          type="button"
          onClick={() => responder("aceptar")}
          disabled={isPending}
          className="rounded-md bg-green-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-700 disabled:opacity-50"
        >
          {isPending ? "Procesando…" : "Aceptar cotización"}
        </button>
      </div>
      {error && <p className="text-right text-sm text-red-600">{error}</p>}
    </div>
  );
}
