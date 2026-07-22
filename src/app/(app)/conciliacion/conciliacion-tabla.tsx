"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatCLP } from "@/lib/money";

const ESTADO_LABEL: Record<string, string> = {
  "sin-factura": "Sin factura",
  diferencia: "Diferencia",
  cuadra: "Cuadra",
};

const ESTADO_BADGE: Record<string, string> = {
  "sin-factura": "bg-slate-100 text-slate-600",
  diferencia: "bg-amber-100 text-amber-700",
  cuadra: "bg-green-100 text-green-700",
};

export type ConciliacionRow = {
  id: string;
  folio: string;
  total: number;
  estado: string;
  created_at: string;
  clientes: { nombre: string } | null;
  facturado: number;
  nFacturas: number;
  estadoConc: string;
  fechaRef: string; // 'AAAA-MM-DD' emisión de factura (o creación) para el mes
};

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function etiquetaMes(clave: string): string {
  const [anio, mes] = clave.split("-").map(Number);
  return `${MESES[mes - 1]} ${anio}`;
}

export function ConciliacionTabla({ filas }: { filas: ConciliacionRow[] }) {
  const [busqueda, setBusqueda] = useState("");
  const [estado, setEstado] = useState("");
  const [mes, setMes] = useState("");

  // Meses presentes (por emisión de la factura vinculada), más reciente primero.
  const meses = useMemo(
    () =>
      Array.from(new Set(filas.map((f) => f.fechaRef.slice(0, 7)))).sort((a, b) =>
        b.localeCompare(a)
      ),
    [filas]
  );

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return filas.filter((f) => {
      if (estado && f.estadoConc !== estado) return false;
      if (mes && f.fechaRef.slice(0, 7) !== mes) return false;
      if (q) {
        const hay = `${f.folio} ${f.clientes?.nombre ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [filas, busqueda, estado, mes]);

  const totalNota = filtradas.reduce((sum, f) => sum + f.total, 0);
  const totalFacturado = filtradas.reduce((sum, f) => sum + f.facturado, 0);

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
            placeholder="Folio o cliente…"
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          Mes
          <select
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            className={inputCls}
          >
            <option value="">Todos</option>
            {meses.map((m) => (
              <option key={m} value={m}>
                {etiquetaMes(m)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          Estado
          <select
            value={estado}
            onChange={(e) => setEstado(e.target.value)}
            className={inputCls}
          >
            <option value="">Todos</option>
            <option value="cuadra">Cuadra</option>
            <option value="diferencia">Diferencia</option>
            <option value="sin-factura">Sin factura</option>
          </select>
        </label>
        {(busqueda || estado || mes) && (
          <button
            type="button"
            onClick={() => {
              setBusqueda("");
              setEstado("");
              setMes("");
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
              <th className="px-4 py-3">Nota</th>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3 text-right">Total nota</th>
              <th className="px-4 py-3 text-right">Facturado SII</th>
              <th className="px-4 py-3 text-right">Diferencia</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3 text-right">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtradas.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  No hay notas de venta que coincidan con los filtros.
                </td>
              </tr>
            ) : (
              filtradas.map((f) => {
                const diff = f.total - f.facturado;
                return (
                  <tr key={f.id} className="text-slate-700">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {f.folio}
                    </td>
                    <td className="px-4 py-3">{f.clientes?.nombre ?? "—"}</td>
                    <td className="px-4 py-3 text-right">
                      {formatCLP(f.total)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {f.nFacturas > 0 ? formatCLP(f.facturado) : "—"}
                      {f.nFacturas > 1 && (
                        <span className="ml-1 text-xs text-slate-400">
                          ({f.nFacturas})
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {f.estadoConc === "cuadra"
                        ? "—"
                        : f.nFacturas > 0
                          ? formatCLP(diff)
                          : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${ESTADO_BADGE[f.estadoConc]}`}
                      >
                        {ESTADO_LABEL[f.estadoConc]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/notas-venta/${f.id}`}
                        className="text-sm font-medium text-brand-600 hover:text-brand-800"
                      >
                        Conciliar
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          {filtradas.length > 0 && (
            <tfoot className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-900">
              <tr>
                <td className="px-4 py-3" colSpan={2}>
                  {filtradas.length} nota{filtradas.length === 1 ? "" : "s"}
                </td>
                <td className="px-4 py-3 text-right">{formatCLP(totalNota)}</td>
                <td className="px-4 py-3 text-right">
                  {formatCLP(totalFacturado)}
                </td>
                <td className="px-4 py-3" colSpan={3} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
