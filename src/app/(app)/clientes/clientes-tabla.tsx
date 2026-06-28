"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { DeleteClienteButton } from "./delete-cliente-button";

export type ClienteRow = {
  id: string;
  nombre: string;
  rut: string | null;
  correo: string;
  telefono: string | null;
};

export function ClientesTabla({ clientes }: { clientes: ClienteRow[] }) {
  const [busqueda, setBusqueda] = useState("");

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return clientes;
    return clientes.filter((c) => {
      const hay = `${c.nombre} ${c.rut ?? ""} ${c.correo} ${c.telefono ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [clientes, busqueda]);

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
            placeholder="Nombre, RUT, correo o teléfono…"
            className={inputCls}
          />
        </label>
        {busqueda && (
          <button
            type="button"
            onClick={() => setBusqueda("")}
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
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">RUT</th>
              <th className="px-4 py-3">Correo</th>
              <th className="px-4 py-3">Teléfono</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtrados.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  {busqueda
                    ? "No se encontraron clientes para la búsqueda."
                    : "Aún no hay clientes registrados."}
                </td>
              </tr>
            ) : (
              filtrados.map((cliente) => (
                <tr key={cliente.id} className="text-slate-700">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {cliente.nombre}
                  </td>
                  <td className="px-4 py-3">{cliente.rut ?? "—"}</td>
                  <td className="px-4 py-3">{cliente.correo}</td>
                  <td className="px-4 py-3">{cliente.telefono ?? "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-4">
                      <Link
                        href={`/clientes/${cliente.id}/editar`}
                        className="text-sm font-medium text-brand-600 hover:text-brand-800"
                      >
                        Editar
                      </Link>
                      <DeleteClienteButton
                        id={cliente.id}
                        nombre={cliente.nombre}
                      />
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
