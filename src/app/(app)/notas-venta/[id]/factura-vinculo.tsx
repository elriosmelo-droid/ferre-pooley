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
  total,
  vinculadas,
  candidatas,
}: {
  notaId: string;
  total: number;
  vinculadas: FacturaOpcion[];
  candidatas: FacturaOpcion[];
}) {
  const [isPending, startTransition] = useTransition();
  const [seleccion, setSeleccion] = useState("");
  const [error, setError] = useState<string | null>(null);

  const facturado = vinculadas.reduce((s, f) => s + f.monto_total, 0);
  const diferencia = total - facturado;

  function vincular() {
    if (!seleccion) return;
    setError(null);
    startTransition(async () => {
      const r = await vincularFacturaVenta(notaId, seleccion);
      if (r.error) setError(r.error);
      else setSeleccion("");
    });
  }

  function desvincular(ventaId: string) {
    setError(null);
    startTransition(async () => {
      const r = await desvincularFacturaVenta(ventaId);
      if (r.error) setError(r.error);
    });
  }

  return (
    <div className="flex flex-col gap-3 text-sm">
      {vinculadas.length > 0 && (
        <ul className="flex flex-col divide-y divide-slate-100 rounded-md border border-slate-200">
          {vinculadas.map((f) => (
            <li
              key={f.id}
              className="flex items-center justify-between gap-3 px-3 py-2"
            >
              <span className="text-slate-700">
                <span className="font-medium text-slate-900">{f.folio}</span> ·{" "}
                {fmt(f.fecha_emision)}
              </span>
              <span className="flex items-center gap-3">
                <span className="font-medium text-slate-900">
                  {formatCLP(f.monto_total)}
                </span>
                <button
                  type="button"
                  onClick={() => desvincular(f.id)}
                  disabled={isPending}
                  className="rounded-md border border-red-300 bg-white px-2 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                >
                  Quitar
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {vinculadas.length > 0 && (
        <dl className="flex flex-col gap-1 rounded-md bg-slate-50 px-3 py-2 text-slate-700">
          <div className="flex justify-between">
            <dt>Total nota</dt>
            <dd className="font-medium text-slate-900">{formatCLP(total)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Facturado (SII)</dt>
            <dd className="font-medium text-slate-900">
              {formatCLP(facturado)}
            </dd>
          </div>
          <div className="flex justify-between border-t border-slate-200 pt-1">
            <dt>Diferencia</dt>
            <dd
              className={
                diferencia === 0
                  ? "font-semibold text-green-600"
                  : "font-semibold text-amber-600"
              }
            >
              {diferencia === 0 ? "Cuadra" : formatCLP(diferencia)}
            </dd>
          </div>
        </dl>
      )}

      {candidatas.length === 0 ? (
        vinculadas.length === 0 && (
          <p className="text-slate-500">
            No hay facturas del SII de este cliente para vincular. Actualiza las
            ventas o revisa que el RUT coincida.
          </p>
        )
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={seleccion}
            onChange={(e) => setSeleccion(e.target.value)}
            disabled={isPending}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50"
          >
            <option value="">Agregar factura del SII…</option>
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
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
