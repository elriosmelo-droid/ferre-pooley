"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatCLP } from "@/lib/money";
import { EstadoBadge, type OrdenCompraEstado } from "./estado-badge";

const ESTADO_LABEL: Record<OrdenCompraEstado, string> = {
  borrador: "Borrador",
  enviada: "Enviada",
  recibida: "Recibida",
  cerrada: "Cerrada",
};

export type OrdenCompraRow = {
  id: string;
  folio: string;
  created_at: string;
  total: number;
  estado: OrdenCompraEstado;
  proveedores: { razon_social: string | null; rut: string } | null;
};

export function OrdenesCompraTabla({
  ordenes,
}: {
  ordenes: OrdenCompraRow[];
}) {
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [estado, setEstado] = useState("");

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return ordenes.filter((o) => {
      const fecha = o.created_at.slice(0, 10);
      if (desde && fecha < desde) return false;
      if (hasta && fecha > hasta) return false;
      if (estado && o.estado !== estado) return false;
      if (q) {
        const hay = `${o.folio} ${o.proveedores?.razon_social ?? ""} ${
          o.proveedores?.rut ?? ""
        }`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [ordenes, desde, hasta, busqueda, estado]);

  const total = filtradas.reduce((sum, o) => sum + o.total, 0);
  const estados = Array.from(
    new Set(ordenes.map((o) => o.estado))
  ) as OrdenCompraEstado[];

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
            placeholder="Folio o proveedor…"
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
              <th className="px-4 py-3">Proveedor</th>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtradas.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  No hay órdenes que coincidan con los filtros.
                </td>
              </tr>
            ) : (
              filtradas.map((orden) => (
                <tr key={orden.id} className="text-slate-700">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {orden.folio}
                  </td>
                  <td className="px-4 py-3">
                    {orden.proveedores?.razon_social ??
                      orden.proveedores?.rut ??
                      "—"}
                  </td>
                  <td className="px-4 py-3">
                    {new Date(orden.created_at).toLocaleDateString("es-CL", {
                      timeZone: "America/Santiago",
                    })}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-slate-900">
                    {formatCLP(orden.total)}
                  </td>
                  <td className="px-4 py-3">
                    <EstadoBadge estado={orden.estado} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/ordenes-compra/${orden.id}`}
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
                <td className="px-4 py-3" colSpan={3}>
                  {filtradas.length} orden{filtradas.length === 1 ? "" : "es"}
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
