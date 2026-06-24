"use client";

import { useState, useTransition } from "react";
import { formatCLP } from "@/lib/money";
import {
  vincularFacturaVenta,
  desvincularFacturaVenta,
} from "../actions";

export type FacturaOpcion = {
  id: string;
  folio: string;
  fecha_emision: string | null;
  monto_total: number;
};

function fmt(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function FacturaVinculo({
  notaId,
  vinculada,
  candidatas,
}: {
  notaId: string;
  vinculada: FacturaOpcion | null;
  candidatas: FacturaOpcion[];
}) {
  const [isPending, startTransition] = useTransition();
  const [seleccion, setSeleccion] = useState("");
  const [error, setError] = useState<string | null>(null);

  function vincular() {
    if (!seleccion) return;
    setError(null);
    startTransition(async () => {
      const r = await vincularFacturaVenta(notaId, seleccion);
      if (r.error) setError(r.error);
    });
  }

  function desvincular() {
    if (!confirm("¿Desvincular esta factura de la nota?")) return;
    setError(null);
    startTransition(async () => {
      const r = await desvincularFacturaVenta(notaId);
      if (r.error) setError(r.error);
    });
  }

  if (vinculada) {
    return (
      <div className="flex flex-col gap-2 text-sm text-slate-700">
        <div className="flex justify-between">
          <dt>Folio SII</dt>
          <dd className="font-medium text-slate-900">{vinculada.folio}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Emitida</dt>
          <dd>{fmt(vinculada.fecha_emision)}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Total factura</dt>
          <dd className="font-medium text-slate-900">
            {formatCLP(vinculada.monto_total)}
          </dd>
        </div>
        <button
          type="button"
          onClick={desvincular}
          disabled={isPending}
          className="mt-1 self-start rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
        >
          {isPending ? "Procesando…" : "Desvincular"}
        </button>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 text-sm">
      {candidatas.length === 0 ? (
        <p className="text-slate-500">
          No hay facturas del SII candidatas para este cliente. Actualiza las
          ventas o revisa que el RUT del cliente coincida.
        </p>
      ) : (
        <>
          <p className="text-slate-500">
            Sin factura vinculada. Elige una factura del SII de este cliente:
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={seleccion}
              onChange={(e) => setSeleccion(e.target.value)}
              disabled={isPending}
              className="rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50"
            >
              <option value="">Selecciona una factura…</option>
              {candidatas.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.folio} · {fmt(f.fecha_emision)} · {formatCLP(f.monto_total)}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={vincular}
              disabled={isPending || !seleccion}
              className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
            >
              {isPending ? "Vinculando…" : "Vincular"}
            </button>
          </div>
        </>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
