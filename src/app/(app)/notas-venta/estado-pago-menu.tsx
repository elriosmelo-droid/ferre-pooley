"use client";

import { useRef, useState, useTransition } from "react";
import { formatCLP } from "@/lib/money";
import { hoyChile } from "@/lib/fecha";
import { MEDIOS_PAGO } from "@/lib/medio-pago";
import { NotaEstadoBadge, type NotaVentaEstado } from "./nota-estado-badge";
import { marcarNotaPagada, volverNotaAPendiente } from "./actions";

const badgeCls: Record<NotaVentaEstado, string> = {
  pendiente: "bg-amber-100 text-amber-700",
  pagada: "bg-green-100 text-green-700",
  anulada: "bg-red-100 text-red-700",
};
const badgeLabel: Record<NotaVentaEstado, string> = {
  pendiente: "Pendiente de pago",
  pagada: "Pagada",
  anulada: "Anulada",
};

// Badge de estado de pago que, con permiso, abre un menú para cambiarlo. No
// edita el estado: crea o borra abonos y deja que el trigger lo recalcule.
export function EstadoPagoMenu({
  notaVentaId,
  estado,
  total,
  cobrado,
  nCobros,
  editable,
}: {
  notaVentaId: string;
  estado: NotaVentaEstado;
  total: number;
  cobrado: number;
  nCobros: number;
  editable: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [fecha, setFecha] = useState(hoyChile);
  const [medio, setMedio] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const boton = useRef<HTMLButtonElement>(null);

  if (!editable || estado === "anulada") {
    return <NotaEstadoBadge estado={estado} />;
  }

  const falta = Math.max(total - cobrado, 0);

  function alternar() {
    if (!abierto && boton.current) {
      // El menú va en `fixed`: la tabla tiene overflow y recortaría uno absoluto.
      const r = boton.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: Math.max(8, r.left) });
    }
    setError(null);
    setAbierto(!abierto);
  }

  function marcar() {
    setError(null);
    startTransition(async () => {
      const res = await marcarNotaPagada({
        nota_venta_id: notaVentaId,
        fecha,
        medio_pago: medio || null,
      });
      if (res?.error) setError(res.error);
      else setAbierto(false);
    });
  }

  function volver() {
    const aviso =
      nCobros > 1
        ? `Se eliminarán los últimos abonos hasta dejar la nota con saldo pendiente (hoy hay ${nCobros}). ¿Continuar?`
        : "Se eliminará el abono registrado y la nota volverá a pendiente. ¿Continuar?";
    if (!confirm(aviso)) return;
    setError(null);
    startTransition(async () => {
      const res = await volverNotaAPendiente(notaVentaId);
      if (res?.error) setError(res.error);
      else setAbierto(false);
    });
  }

  const inputCls =
    "w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900 focus:border-brand-500 focus:outline-none";

  return (
    <>
      <button
        ref={boton}
        type="button"
        onClick={alternar}
        aria-haspopup="dialog"
        aria-expanded={abierto}
        title="Cambiar estado de pago"
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${badgeCls[estado]}`}
      >
        {badgeLabel[estado]}
        <span aria-hidden>▾</span>
      </button>
      {abierto && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setAbierto(false)} />
          <div
            role="dialog"
            style={{ top: pos.top, left: pos.left }}
            className="fixed z-50 w-64 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-lg"
          >
            {estado === "pendiente" ? (
              falta > 0 ? (
                <div className="flex flex-col gap-3 text-sm text-slate-700">
                  <p>
                    Se registrará un abono de{" "}
                    <strong>{formatCLP(falta)}</strong>
                    {cobrado > 0 && " (lo que falta)"}.
                  </p>
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
                    Medio de pago
                    <select
                      value={medio}
                      onChange={(e) => setMedio(e.target.value)}
                      className={inputCls}
                    >
                      <option value="">Sin indicar</option>
                      {MEDIOS_PAGO.map((m) => (
                        <option key={m.valor} value={m.valor}>
                          {m.etiqueta}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={marcar}
                    disabled={isPending || !fecha}
                    className="rounded-md bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    {isPending ? "Guardando…" : "Marcar pagada"}
                  </button>
                </div>
              ) : (
                <p className="text-sm text-slate-600">
                  Esta nota no tiene saldo por cobrar.
                </p>
              )
            ) : (
              <div className="flex flex-col gap-3 text-sm text-slate-700">
                <p>Pagada. Volver a pendiente borra sus abonos más recientes.</p>
                <button
                  type="button"
                  onClick={volver}
                  disabled={isPending}
                  className="rounded-md border border-amber-400 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                >
                  {isPending ? "Guardando…" : "Volver a pendiente"}
                </button>
              </div>
            )}
            {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
          </div>
        </>
      )}
    </>
  );
}
