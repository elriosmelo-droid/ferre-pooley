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

      {filtrados.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
          No hay clientes que coincidan.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtrados.map((c) => (
            <Link
              key={c.id}
              href={`/estados-cuenta/${c.id}`}
              className="group flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 transition-all hover:border-brand-300 hover:shadow-md"
            >
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-bold uppercase text-brand-700">
                  {c.nombre.trim().charAt(0) || "?"}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900" title={c.nombre}>
                    {c.nombre}
                  </p>
                  <p className="text-xs text-slate-500">{c.rut ?? "sin RUT"}</p>
                </div>
              </div>
              <span className="mt-auto inline-flex items-center gap-1 text-sm font-medium text-brand-600 group-hover:gap-1.5">
                Ver estado
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
