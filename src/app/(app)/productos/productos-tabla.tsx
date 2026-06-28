"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatCLP } from "@/lib/money";

export type ProductoRow = {
  id: string;
  sku: string;
  descripcion: string;
  costo: number;
  precio: number;
  activo: boolean;
};

function formatMargen(costo: number, precio: number): string {
  if (costo === 0) return "—";
  return `${Math.round(((precio - costo) / costo) * 100)}%`;
}

export function ProductosTabla({ productos }: { productos: ProductoRow[] }) {
  const [buscar, setBuscar] = useState("");
  const [estado, setEstado] = useState("");

  const filtrados = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return productos.filter((p) => {
      if (estado === "activos" && !p.activo) return false;
      if (estado === "inactivos" && p.activo) return false;
      if (q) {
        const hay = `${p.sku} ${p.descripcion}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [productos, buscar, estado]);

  const inputCls =
    "rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none";

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          Buscar
          <input
            type="text"
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            placeholder="SKU o descripción…"
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          Estado
          <select value={estado} onChange={(e) => setEstado(e.target.value)} className={inputCls}>
            <option value="">Todos</option>
            <option value="activos">Activos</option>
            <option value="inactivos">Inactivos</option>
          </select>
        </label>
        {(buscar || estado) && (
          <button
            type="button"
            onClick={() => { setBuscar(""); setEstado(""); }}
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
              <th className="px-4 py-3">SKU</th>
              <th className="px-4 py-3">Descripción</th>
              <th className="px-4 py-3 text-right">Costo</th>
              <th className="px-4 py-3 text-right">Precio</th>
              <th className="px-4 py-3 text-right">Margen</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtrados.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  No hay productos que coincidan con los filtros.
                </td>
              </tr>
            ) : (
              filtrados.map((producto) => (
                <tr
                  key={producto.id}
                  className={producto.activo ? "text-slate-700" : "text-slate-400"}
                >
                  <td
                    className={`px-4 py-3 font-medium ${
                      producto.activo ? "text-slate-900" : "text-slate-400"
                    }`}
                  >
                    {producto.sku}
                  </td>
                  <td className="px-4 py-3">{producto.descripcion}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatCLP(producto.costo)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatCLP(producto.precio)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatMargen(producto.costo, producto.precio)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        producto.activo
                          ? "bg-green-100 text-green-800"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {producto.activo ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/productos/${producto.id}/editar`}
                      className="text-sm font-medium text-brand-600 hover:text-brand-800"
                    >
                      Editar
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {filtrados.length > 0 && (
            <tfoot className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-900">
              <tr>
                <td className="px-4 py-3" colSpan={7}>
                  {filtrados.length} producto{filtrados.length === 1 ? "" : "s"}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
