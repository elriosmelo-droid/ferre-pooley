"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatCLP } from "@/lib/money";
import { agregarMargen, formatPct } from "@/lib/totals";
import { NotaEstadoBadge, type NotaVentaEstado } from "./nota-estado-badge";

const ESTADO_LABEL: Record<NotaVentaEstado, string> = {
  pendiente: "Pendiente de pago",
  pagada: "Pagada",
  anulada: "Anulada",
};

export type NotaVentaRow = {
  id: string;
  folio: string;
  created_at: string;
  total: number;
  estado: NotaVentaEstado;
  clientes: { nombre: string } | null;
  cotizaciones: { id: string; folio: string } | null;
  // Margen ya reducido en el server: venta neta y costo de los ítems, sin
  // flete. La resta entre ambos es el margen interno de la nota.
  venta: number;
  costo: number;
  // Suma de los abonos registrados. El saldo es total − cobrado.
  cobrado: number;
};

export function NotasVentaTabla({ notas }: { notas: NotaVentaRow[] }) {
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [estado, setEstado] = useState("");

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return notas.filter((n) => {
      const fecha = n.created_at.slice(0, 10);
      if (desde && fecha < desde) return false;
      if (hasta && fecha > hasta) return false;
      if (estado && n.estado !== estado) return false;
      if (q) {
        const hay = `${n.folio} ${n.clientes?.nombre ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [notas, desde, hasta, busqueda, estado]);

  const total = filtradas.reduce((sum, n) => sum + n.total, 0);
  // Sobre el mismo conjunto que el Total: si el filtro deja pasar anuladas,
  // entran en los dos números y no se contradicen entre sí.
  const margen = agregarMargen(filtradas);
  const estados = Array.from(
    new Set(notas.map((n) => n.estado))
  ) as NotaVentaEstado[];

  const inputCls =
    "rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none";

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          Desde
          <input
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          Hasta
          <input
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          Buscar
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Folio o cliente…"
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          Estado
          <select
            value={estado}
            onChange={(e) => setEstado(e.target.value)}
            className={inputCls}
          >
            <option value="">Todos</option>
            {estados.map((e) => (
              <option key={e} value={e}>
                {ESTADO_LABEL[e] ?? e}
              </option>
            ))}
          </select>
        </label>
        {(desde || hasta || busqueda || estado) && (
          <button
            type="button"
            onClick={() => {
              setDesde("");
              setHasta("");
              setBusqueda("");
              setEstado("");
            }}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            Limpiar
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Folio</th>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Cotización</th>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3 text-right">Saldo</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtradas.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                  No hay notas de venta que coincidan con los filtros.
                </td>
              </tr>
            ) : (
              filtradas.map((nota) => (
                <tr key={nota.id} className="text-slate-700">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {nota.folio}
                  </td>
                  <td className="px-4 py-3">{nota.clientes?.nombre ?? "—"}</td>
                  <td className="px-4 py-3">
                    {nota.cotizaciones ? (
                      <Link
                        href={`/cotizaciones/${nota.cotizaciones.id}`}
                        className="font-medium text-brand-600 hover:text-brand-800"
                      >
                        {nota.cotizaciones.folio}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {new Date(nota.created_at).toLocaleDateString("es-CL", {
                      timeZone: "America/Santiago",
                    })}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-slate-900">
                    {formatCLP(nota.total)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {(() => {
                      const pendiente = nota.total - nota.cobrado;
                      if (pendiente === 0)
                        return <span className="text-slate-400">—</span>;
                      return (
                        <span
                          className={
                            pendiente > 0
                              ? "font-medium text-amber-700"
                              : "font-medium text-red-600"
                          }
                        >
                          {formatCLP(pendiente)}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3">
                    <NotaEstadoBadge estado={nota.estado} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/notas-venta/${nota.id}`}
                      className="text-sm font-medium text-brand-600 hover:text-brand-800"
                    >
                      Ver
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {filtradas.length > 0 && (
            <tfoot className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-900">
              <tr>
                <td className="px-4 py-3" colSpan={4}>
                  {filtradas.length} nota{filtradas.length === 1 ? "" : "s"} de
                  venta
                </td>
                <td className="px-4 py-3 text-right">{formatCLP(total)}</td>
                <td className="px-4 py-3 text-right">
                  {formatCLP(
                    filtradas.reduce((s, n) => s + (n.total - n.cobrado), 0)
                  )}
                </td>
                <td className="px-4 py-3 text-right" colSpan={2}>
                  <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Margen interno
                  </span>{" "}
                  <span
                    className={
                      margen.margen < 0 ? "text-red-600" : "text-slate-900"
                    }
                  >
                    {formatCLP(margen.margen)} ({formatPct(margen.pct)})
                  </span>
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
