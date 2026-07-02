"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { formatCLP } from "@/lib/money";
import { EstadoBadge, type CotizacionEstado } from "./estado-badge";
import { pasarANotaVenta } from "./actions";

const ESTADO_LABEL: Record<CotizacionEstado, string> = {
  borrador: "Borrador",
  enviada: "Enviada",
  aceptada: "Aceptada",
  rechazada: "Rechazada",
  vencida: "Vencida",
};

type NotaRef = { id: string; folio: string };

export type CotizacionRow = {
  id: string;
  folio: string;
  created_at: string;
  fecha_validez: string;
  total: number;
  estado: CotizacionEstado;
  clientes: { nombre: string } | null;
  // El unique de notas_venta.cotizacion_id hace el embed to-one, pero se
  // normaliza por si PostgREST lo entrega como arreglo.
  notas_venta: NotaRef | NotaRef[] | null;
};

function notaDe(c: CotizacionRow): NotaRef | null {
  return Array.isArray(c.notas_venta)
    ? (c.notas_venta[0] ?? null)
    : c.notas_venta;
}

function formatFecha(value: string) {
  const [anio, mes, dia] = value.slice(0, 10).split("-");
  return `${dia}-${mes}-${anio}`;
}

export function CotizacionesTabla({
  cotizaciones,
}: {
  cotizaciones: CotizacionRow[];
}) {
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [estado, setEstado] = useState("");
  const [isPending, startTransition] = useTransition();
  // Fila cuya conversión a nota está en curso (deshabilita solo ese botón).
  const [pasandoId, setPasandoId] = useState<string | null>(null);

  function pasarANota(id: string) {
    setPasandoId(id);
    startTransition(async () => {
      // En éxito el servidor redirige a la nota creada; si falla, se libera
      // el botón para reintentar.
      await pasarANotaVenta(id);
      setPasandoId(null);
    });
  }

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return cotizaciones.filter((c) => {
      const fecha = c.created_at.slice(0, 10);
      if (desde && fecha < desde) return false;
      if (hasta && fecha > hasta) return false;
      if (estado && c.estado !== estado) return false;
      if (q) {
        const hay = `${c.folio} ${c.clientes?.nombre ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [cotizaciones, desde, hasta, busqueda, estado]);

  const total = filtradas.reduce((sum, c) => sum + c.total, 0);
  const estados = Array.from(
    new Set(cotizaciones.map((c) => c.estado))
  ) as CotizacionEstado[];

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
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Válida hasta</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtradas.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  No hay cotizaciones que coincidan con los filtros.
                </td>
              </tr>
            ) : (
              filtradas.map((cotizacion) => (
                <tr key={cotizacion.id} className="text-slate-700">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {cotizacion.folio}
                  </td>
                  <td className="px-4 py-3">
                    {cotizacion.clientes?.nombre ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    {new Date(cotizacion.created_at).toLocaleDateString(
                      "es-CL",
                      { timeZone: "America/Santiago" }
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {formatFecha(cotizacion.fecha_validez)}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-slate-900">
                    {formatCLP(cotizacion.total)}
                  </td>
                  <td className="px-4 py-3">
                    <EstadoBadge estado={cotizacion.estado} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-3 whitespace-nowrap">
                      <Link
                        href={`/cotizaciones/${cotizacion.id}`}
                        className="text-sm font-medium text-brand-600 hover:text-brand-800"
                      >
                        Ver
                      </Link>
                      {(() => {
                        const nota = notaDe(cotizacion);
                        return nota ? (
                          <Link
                            href={`/notas-venta/${nota.id}`}
                            title={`Ya tiene nota de venta ${nota.folio}`}
                            className="text-sm font-medium text-slate-500 hover:text-slate-700"
                          >
                            {nota.folio}
                          </Link>
                        ) : (
                          <button
                            type="button"
                            onClick={() => pasarANota(cotizacion.id)}
                            disabled={isPending && pasandoId === cotizacion.id}
                            title="Crear nota de venta con los ítems de esta cotización"
                            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
                          >
                            {isPending && pasandoId === cotizacion.id
                              ? "Creando…"
                              : "A nota de venta"}
                          </button>
                        );
                      })()}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {filtradas.length > 0 && (
            <tfoot className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-900">
              <tr>
                <td className="px-4 py-3" colSpan={4}>
                  {filtradas.length} cotización
                  {filtradas.length === 1 ? "" : "es"}
                </td>
                <td className="px-4 py-3 text-right">{formatCLP(total)}</td>
                <td className="px-4 py-3" colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
