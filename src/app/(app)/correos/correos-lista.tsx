"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

export type CorreoRow = {
  id: string;
  de: string | null;
  asunto: string | null;
  recibido_at: string;
  leido: boolean;
};

function fmtFechaHora(iso: string) {
  return new Date(iso).toLocaleString("es-CL", {
    timeZone: "America/Santiago",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function CorreosLista({ correos }: { correos: CorreoRow[] }) {
  const [busqueda, setBusqueda] = useState("");

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return correos;
    return correos.filter((c) =>
      `${c.de ?? ""} ${c.asunto ?? ""}`.toLowerCase().includes(q)
    );
  }, [correos, busqueda]);

  return (
    <div>
      <label className="mb-4 flex flex-col gap-1 text-xs text-slate-500">
        Buscar
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Remitente o asunto…"
          className="min-w-64 max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none"
        />
      </label>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <ul className="divide-y divide-slate-100">
          {filtrados.length === 0 ? (
            <li className="px-4 py-10 text-center text-sm text-slate-500">
              No hay correos.
            </li>
          ) : (
            filtrados.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/correos/${c.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50"
                >
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${
                      c.leido ? "bg-transparent" : "bg-brand-600"
                    }`}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className={`truncate text-sm ${
                        c.leido ? "text-slate-600" : "font-semibold text-slate-900"
                      }`}
                    >
                      {c.de ?? "—"}
                    </p>
                    <p
                      className={`truncate text-sm ${
                        c.leido ? "text-slate-500" : "text-slate-700"
                      }`}
                    >
                      {c.asunto || "(sin asunto)"}
                    </p>
                  </div>
                  <span className="shrink-0 whitespace-nowrap text-xs text-slate-400">
                    {fmtFechaHora(c.recibido_at)}
                  </span>
                </Link>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
