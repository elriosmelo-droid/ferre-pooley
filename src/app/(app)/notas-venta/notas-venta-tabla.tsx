"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatCLP } from "@/lib/money";
import { formatPct } from "@/lib/totals";
import { totalesListadoNotas } from "@/lib/cobros";
import { diaChile, hoyChile, ultimosMeses } from "@/lib/fecha";
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
  // Fecha en que ocurrió la venta: emisión de su factura del SII, o el día en
  // que se cargó la nota si todavía no se factura. NO es created_at.
  fechaVenta: string;
};

// 'AAAA-MM-DD' a 'DD/MM/AAAA'.
function formatFecha(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export function NotasVentaTabla({ notas }: { notas: NotaVentaRow[] }) {
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [estado, setEstado] = useState("");
  // Atajos por mes: el mes en curso y los dos anteriores. Setean desde/hasta,
  // así que no son un filtro aparte y se pueden ajustar a mano después.
  const meses = useMemo(() => ultimosMeses(hoyChile(), 3), []);
  const mesActivo = meses.find((m) => m.desde === desde && m.hasta === hasta);

  function alternarMes(m: (typeof meses)[number]) {
    if (mesActivo?.clave === m.clave) {
      setDesde("");
      setHasta("");
    } else {
      setDesde(m.desde);
      setHasta(m.hasta);
    }
  }

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return notas.filter((n) => {
      // Se filtra por la fecha de la venta (emisión de la factura), no por la
      // de digitación: es la que usa el SII y con la que cuadra el contador.
      const fecha = n.fechaVenta;
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

  // Las anuladas quedan fuera de todos los totales: no facturaron, no se
  // cobran y no dejaron margen, así que sumarlas afirmaría una venta que no
  // existió y el pie no cuadraría con /finanzas ni con el SII. Siguen
  // visibles como filas; el pie dice cuántas hay.
  const tot = totalesListadoNotas(
    filtradas.map((n) => ({
      total: n.total,
      venta: n.venta,
      costo: n.costo,
      cobrado: n.cobrado,
      anulada: n.estado === "anulada",
    }))
  );
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

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500">Mes:</span>
        {meses.map((m) => {
          const activo = mesActivo?.clave === m.clave;
          return (
            <button
              key={m.clave}
              type="button"
              onClick={() => alternarMes(m)}
              aria-pressed={activo}
              title={
                activo
                  ? "Quitar el filtro de mes"
                  : `Ver las ventas de ${m.etiqueta}`
              }
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                activo
                  ? "bg-brand-600 text-white"
                  : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {m.etiqueta}
            </button>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Folio</th>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Cotización</th>
              <th className="px-4 py-3">Fecha venta</th>
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
                  <td className="px-4 py-3 whitespace-nowrap">
                    {formatFecha(nota.fechaVenta)}
                    {nota.fechaVenta !== diaChile(nota.created_at) && (
                      <div
                        className="text-xs text-slate-400"
                        title={`La nota se cargó el ${formatFecha(diaChile(nota.created_at))}; la venta se fecha por la emisión de su factura`}
                      >
                        cargada {formatFecha(diaChile(nota.created_at))}
                      </div>
                    )}
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
                  {tot.notas} nota{tot.notas === 1 ? "" : "s"} de venta
                  {tot.anuladas > 0 && (
                    <span className="ml-2 text-xs font-normal text-slate-500">
                      + {tot.anuladas} anulada{tot.anuladas === 1 ? "" : "s"} sin
                      sumar
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">{formatCLP(tot.total)}</td>
                <td className="px-4 py-3 text-right">
                  {formatCLP(tot.saldo)}
                </td>
                <td className="px-4 py-3 text-right" colSpan={2}>
                  <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Margen interno
                  </span>{" "}
                  <span
                    className={
                      tot.margen < 0 ? "text-red-600" : "text-slate-900"
                    }
                  >
                    {formatCLP(tot.margen)} ({formatPct(tot.pctMargen)})
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
