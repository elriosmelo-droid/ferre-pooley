"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { formatCLP } from "@/lib/money";
import type { FilaValidada } from "@/lib/productos-import";
import { importarProductos, previsualizarImportacion } from "./actions";

const ESTADOS = {
  nuevo: { label: "Nuevo", cls: "bg-green-100 text-green-800" },
  actualizar: { label: "Actualizar", cls: "bg-blue-100 text-blue-800" },
  error: { label: "Error", cls: "bg-red-100 text-red-800" },
} as const;

export function ImportarProductos({ verCostos }: { verCostos: boolean }) {
  const [filas, setFilas] = useState<FilaValidada[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);
  const [soloErrores, setSoloErrores] = useState(false);
  const [pending, startTransition] = useTransition();

  const validas = filas?.filter((f) => f.estado !== "error") ?? [];
  const conError = filas?.filter((f) => f.estado === "error") ?? [];
  const visibles = soloErrores ? conError : (filas ?? []);

  function onArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    setError(null);
    setResultado(null);
    setFilas(null);
    setSoloErrores(false);
    const fd = new FormData();
    fd.set("archivo", archivo);
    startTransition(async () => {
      const r = await previsualizarImportacion(fd);
      if ("error" in r) setError(r.error);
      else setFilas(r.filas);
    });
  }

  function onImportar() {
    setError(null);
    startTransition(async () => {
      const r = await importarProductos(
        validas.map((f) => ({ fila: f.fila, ...f.datos! }))
      );
      if (r.error) {
        setError(r.error);
        return;
      }
      setFilas(null);
      setResultado(
        `Listo: ${r.creados} producto${r.creados === 1 ? "" : "s"} creado${r.creados === 1 ? "" : "s"} y ${r.actualizados} actualizado${r.actualizados === 1 ? "" : "s"}.`
      );
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-6">
        <a
          href="/productos/plantilla"
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
        >
          Descargar plantilla
        </a>
        <label
          className={`cursor-pointer rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 ${pending ? "pointer-events-none opacity-50" : ""}`}
        >
          {pending && !filas ? "Leyendo archivo…" : "Subir Excel"}
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={onArchivo}
            className="sr-only"
          />
        </label>
        <Link
          href="/productos"
          className="rounded-md px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100"
        >
          Volver a productos
        </Link>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {resultado && (
        <p className="rounded-lg bg-green-50 px-4 py-3 text-sm font-medium text-green-800">
          {resultado}{" "}
          <Link href="/productos" className="underline">
            Ver productos
          </Link>
        </p>
      )}

      {filas && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-700">
              {filas.filter((f) => f.estado === "nuevo").length} nuevos ·{" "}
              {filas.filter((f) => f.estado === "actualizar").length} a actualizar ·{" "}
              <span className={conError.length ? "font-semibold text-red-700" : ""}>
                {conError.length} con errores
              </span>
              {conError.length > 0 && " (no se importan)"}
            </p>
            <div className="flex items-center gap-3">
              {conError.length > 0 && (
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={soloErrores}
                    onChange={(e) => setSoloErrores(e.target.checked)}
                  />
                  Ver solo errores
                </label>
              )}
              <button
                type="button"
                onClick={onImportar}
                disabled={pending || validas.length === 0}
                className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
              >
                {pending ? "Importando…" : `Importar ${validas.length} producto${validas.length === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Fila</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">SKU propio</th>
                  <th className="px-4 py-3">SKU proveedor</th>
                  <th className="px-4 py-3">Descripción</th>
                  {verCostos && <th className="px-4 py-3 text-right">Costo</th>}
                  <th className="px-4 py-3 text-right">Precio venta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibles.map((f) => (
                  <tr key={f.fila} className="text-slate-700">
                    <td className="px-4 py-2 tabular-nums text-slate-500">{f.fila}</td>
                    <td className="px-4 py-2">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${ESTADOS[f.estado].cls}`}>
                        {ESTADOS[f.estado].label}
                      </span>
                    </td>
                    {f.datos ? (
                      <>
                        <td className="px-4 py-2 font-medium text-slate-900">{f.datos.sku}</td>
                        <td className="px-4 py-2 font-mono text-xs">{f.datos.sku_proveedor ?? "—"}</td>
                        <td className="px-4 py-2">{f.datos.descripcion}</td>
                        {verCostos && (
                          <td className="px-4 py-2 text-right tabular-nums">{formatCLP(f.datos.costo)}</td>
                        )}
                        <td className="px-4 py-2 text-right tabular-nums">{formatCLP(f.datos.precio)}</td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-2 font-medium text-slate-900">{f.sku || "—"}</td>
                        <td className="px-4 py-2 text-red-700" colSpan={verCostos ? 4 : 3}>
                          {f.errores.join(" · ")}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
