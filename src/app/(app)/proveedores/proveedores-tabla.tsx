"use client";

import { useMemo, useState } from "react";
import { formatCLP } from "@/lib/money";
import { TIPOS_PROVEEDOR, ETIQUETAS_TIPO, type TipoProveedor } from "./tipos";
import { TipoSelect } from "./tipo-select";
import { CorreoInput } from "./correo-input";

export type ProveedorRow = {
  id: string;
  rut: string;
  razon_social: string | null;
  tipo: TipoProveedor | null;
  correo: string | null;
  facturas: number;
  total_comprado: number;
};

export function ProveedoresTabla({ proveedores }: { proveedores: ProveedorRow[] }) {
  const [busqueda, setBusqueda] = useState("");
  const [tipo, setTipo] = useState("");

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return proveedores.filter((p) => {
      if (tipo === "sin-clasificar") {
        if (p.tipo !== null) return false;
      } else if (tipo) {
        if (p.tipo !== tipo) return false;
      }
      if (q) {
        const hay = `${p.razon_social ?? ""} ${p.rut} ${p.correo ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [proveedores, busqueda, tipo]);

  const total = filtrados.reduce((sum, p) => sum + p.total_comprado, 0);

  const inputCls =
    "rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none";

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          Buscar
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Razón social, RUT o correo…"
            className={`${inputCls} min-w-64`}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          Tipo
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={inputCls}>
            <option value="">Todos</option>
            {TIPOS_PROVEEDOR.map((t) => (
              <option key={t} value={t}>
                {ETIQUETAS_TIPO[t]}
              </option>
            ))}
            <option value="sin-clasificar">Sin clasificar</option>
          </select>
        </label>
        {(busqueda || tipo) && (
          <button
            type="button"
            onClick={() => {
              setBusqueda("");
              setTipo("");
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
              <th className="px-4 py-3">Proveedor</th>
              <th className="px-4 py-3">RUT</th>
              <th className="px-4 py-3 text-right">Facturas</th>
              <th className="px-4 py-3 text-right">Total comprado</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Correo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtrados.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  No hay proveedores que coincidan con los filtros.
                </td>
              </tr>
            ) : (
              filtrados.map((p) => (
                <tr key={p.id} className="text-slate-700">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {p.razon_social ?? "—"}
                  </td>
                  <td className="px-4 py-3">{p.rut}</td>
                  <td className="px-4 py-3 text-right">{p.facturas}</td>
                  <td className="px-4 py-3 text-right font-medium text-slate-900">
                    {formatCLP(p.total_comprado)}
                  </td>
                  <td className="px-4 py-3">
                    <TipoSelect proveedorId={p.id} tipo={p.tipo} />
                  </td>
                  <td className="px-4 py-3">
                    <CorreoInput proveedorId={p.id} correo={p.correo} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {filtrados.length > 0 && (
            <tfoot className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-900">
              <tr>
                <td className="px-4 py-3" colSpan={3}>
                  {filtrados.length} proveedor{filtrados.length === 1 ? "" : "es"}
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
