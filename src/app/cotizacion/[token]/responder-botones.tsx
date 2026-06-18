"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FirmaCanvas, type FirmaCanvasHandle } from "./firma-canvas";

export function ResponderBotones({ token }: { token: string }) {
  const router = useRouter();
  const firmaRef = useRef<FirmaCanvasHandle>(null);
  const [firmante, setFirmante] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enviar(
    accion: "aceptar" | "rechazar",
    extra?: { firma: string; firmante: string }
  ) {
    setError(null);
    setIsPending(true);
    try {
      const res = await fetch(`/cotizacion/${token}/responder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion, ...extra }),
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

  function aceptar() {
    const nombre = firmante.trim();
    if (!nombre) {
      setError("Escribe tu nombre para firmar la aceptación.");
      return;
    }
    const firma = firmaRef.current?.obtenerFirma();
    if (!firma) {
      setError("Dibuja tu firma para aceptar la cotización.");
      return;
    }
    if (!confirm("¿Confirmar aceptación de la cotización?")) {
      return;
    }
    enviar("aceptar", { firma, firmante: nombre });
  }

  function rechazar() {
    if (!confirm("¿Rechazar la cotización?")) {
      return;
    }
    enviar("rechazar");
  }

  return (
    <div className="flex flex-col gap-5 border-t border-slate-200 pt-6">
      <div>
        <p className="mb-3 text-sm font-medium text-slate-700">
          Para aceptar, escribe tu nombre y firma en el recuadro:
        </p>
        <label htmlFor="firmante" className="mb-1 block text-sm text-slate-600">
          Nombre de quien acepta
        </label>
        <input
          id="firmante"
          type="text"
          value={firmante}
          onChange={(e) => setFirmante(e.target.value)}
          placeholder="Nombre y apellido"
          className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <FirmaCanvas ref={firmaRef} />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={rechazar}
          disabled={isPending}
          className="rounded-md border border-red-300 bg-white px-5 py-2.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50"
        >
          Rechazar
        </button>
        <button
          type="button"
          onClick={aceptar}
          disabled={isPending}
          className="rounded-md bg-green-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-700 disabled:opacity-50"
        >
          {isPending ? "Procesando…" : "Aceptar y firmar"}
        </button>
      </div>
      {error && <p className="text-right text-sm text-red-600">{error}</p>}
    </div>
  );
}
