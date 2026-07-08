"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

export type ClienteLista = {
  id: string;
  nombre: string;
  rut: string | null;
};

export function EstadosCuentaLista({ clientes }: { clientes: ClienteLista[] }) {
  const [busqueda, setBusqueda] = useState("");

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return clientes;
    return clientes.filter((c) =>
      `${c.nombre} ${c.rut ?? ""}`.toLowerCase().includes(q)
    );
  }, [clientes, busqueda]);

  return (
    <div>
      <label className="mb-4 flex flex-col gap-1 text-xs text-slate-500">
        Buscar
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Nombre o RUT…"
          className="min-w-64 max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none"
        />
      </label>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <ul className="divide-y divide-slate-100">
          {filtrados.length === 0 ? (
            <li className="px-4 py-8 text-center text-sm text-slate-500">
              No hay clientes que coincidan.
            </li>
          ) : (
            filtrados.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/estados-cuenta/${c.id}`}
                  className="flex items-center justify-between px-4 py-3 text-sm transition-colors hover:bg-slate-50"
                >
                  <span className="font-medium text-slate-900">{c.nombre}</span>
                  <span className="text-slate-500">{c.rut ?? "sin RUT"}</span>
                </Link>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
