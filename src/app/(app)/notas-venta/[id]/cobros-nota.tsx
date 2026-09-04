"use client";

import { useState, useTransition } from "react";
import { formatCLP } from "@/lib/money";
import { cobrado, saldo, hoyChile, type Cobro } from "@/lib/cobros";
import { MEDIOS_PAGO, etiquetaMedioPago } from "@/lib/medio-pago";
import { registrarCobro, eliminarCobro } from "../actions";

function formatFecha(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export function CobrosNota({
  notaVentaId,
  total,
  cobros,
  anulada,
}: {
  notaVentaId: string;
  total: number;
  cobros: Cobro[];
  anulada: boolean;
}) {
  const pagado = cobrado(cobros);
  const pendiente = saldo(total, cobros);

  // El caso normal es que el cliente pagó todo: el monto viene con el saldo y
  // la fecha con hoy, así que registrar es un click. El abono parcial es
  // escribir otro monto.
  const [monto, setMonto] = useState(() =>
    pendiente > 0 ? String(pendiente) : ""
  );
  // registrarCobro/eliminarCobro revalidan la ruta: cuando la transición
  // termina, este componente vuelve a recibir `total`/`cobros` frescos del
  // servidor y `pendiente` cambia. Re-prellenamos con ese saldo nuevo (no
  // con "saldo anterior menos lo que se acaba de tipear", que podría no
  // coincidir si el trigger o un cobro concurrente movió el número). Se
  // ajusta durante el render, no en un efecto: es el patrón que React
  // recomienda para sincronizar estado con un prop que cambió, y evita el
  // repintado extra de un setState dentro de useEffect.
  const [pendienteVisto, setPendienteVisto] = useState(pendiente);
  if (pendiente !== pendienteVisto) {
    setPendienteVisto(pendiente);
    setMonto(pendiente > 0 ? String(pendiente) : "");
  }
  const [fecha, setFecha] = useState(hoyChile);
  const [medio, setMedio] = useState("");
  const [observacion, setObservacion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function registrar() {
    setError(null);
    startTransition(async () => {
      const res = await registrarCobro({
        nota_venta_id: notaVentaId,
        monto: Number(monto),
        fecha,
        medio_pago: medio || null,
        observacion: observacion || null,
      });
      if (res?.error) {
        setError(res.error);
        return;
      }
      setObservacion("");
      // El monto no se limpia acá: el efecto de arriba lo re-prellena con el
      // saldo que devuelva el servidor una vez la revalidación llegue.
    });
  }

  function borrar(id: string) {
    if (!confirm("¿Eliminar este cobro?")) return;
    setError(null);
    startTransition(async () => {
      const res = await eliminarCobro(id, notaVentaId);
      if (res?.error) setError(res.error);
    });
  }

  const inputCls =
    "rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none";

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-6 py-4">
        <h2 className="text-lg font-bold text-slate-900">Cobros</h2>
        <p className="mt-1 text-sm text-slate-500">
          Cada abono con la fecha en que entró el dinero, no la de registro.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4 border-b border-slate-100 px-6 py-4 text-sm">
        <div>
          <p className="text-slate-500">Total</p>
          <p className="text-lg font-bold text-slate-900">{formatCLP(total)}</p>
        </div>
        <div>
          <p className="text-slate-500">Cobrado</p>
          <p className="text-lg font-bold text-slate-900">
            {formatCLP(pagado)}
          </p>
        </div>
        <div>
          <p className="text-slate-500">
            {pendiente < 0 ? "A favor del cliente" : "Saldo"}
          </p>
          <p
            className={`text-lg font-bold ${
              pendiente > 0
                ? "text-amber-700"
                : pendiente < 0
                  ? "text-red-600"
                  : "text-green-700"
            }`}
          >
            {formatCLP(Math.abs(pendiente))}
          </p>
        </div>
      </div>

      {cobros.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {cobros.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between gap-4 px-6 py-3 text-sm"
            >
              <div>
                <span className="font-medium text-slate-900">
                  {formatCLP(c.monto)}
                </span>{" "}
                <span className="text-slate-500">
                  · {formatFecha(c.fecha)}
                  {c.medio_pago
                    ? ` · ${etiquetaMedioPago(c.medio_pago)}`
                    : ""}
                </span>
                {c.observacion && (
                  <p className="text-xs text-slate-500">{c.observacion}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => borrar(c.id)}
                disabled={isPending}
                className="text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
              >
                Eliminar
              </button>
            </li>
          ))}
        </ul>
      )}

      {anulada ? (
        <p className="px-6 py-4 text-sm text-slate-500">
          La nota está anulada: no acepta cobros.
        </p>
      ) : (
        <div className="flex flex-wrap items-end gap-3 border-t border-slate-100 px-6 py-4">
          <label className="flex flex-col gap-1 text-xs text-slate-500">
            Monto
            <input
              type="text"
              inputMode="numeric"
              value={monto}
              onChange={(e) => setMonto(e.target.value.replace(/\D/g, ""))}
              className={inputCls}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-500">
            Fecha del pago
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className={inputCls}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-500">
            Medio
            <select
              value={medio}
              onChange={(e) => setMedio(e.target.value)}
              className={inputCls}
            >
              <option value="">—</option>
              {MEDIOS_PAGO.map((m) => (
                <option key={m.valor} value={m.valor}>
                  {m.etiqueta}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-500">
            Observación
            <input
              type="text"
              value={observacion}
              onChange={(e) => setObservacion(e.target.value)}
              placeholder="Nº transferencia, banco…"
              className={inputCls}
            />
          </label>
          <button
            type="button"
            onClick={registrar}
            disabled={isPending || !monto}
            className="rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-50"
          >
            {isPending ? "Guardando…" : "Registrar cobro"}
          </button>
          {error && <p className="w-full text-xs text-red-600">{error}</p>}
        </div>
      )}
    </section>
  );
}
