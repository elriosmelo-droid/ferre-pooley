"use client";

import { useState, useTransition } from "react";
import { setTipoProveedor } from "./actions";
import { TIPOS_PROVEEDOR, ETIQUETAS_TIPO, type TipoProveedor } from "./tipos";

export function TipoSelect({
  proveedorId,
  tipo,
}: {
  proveedorId: string;
  tipo: TipoProveedor | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [valor, setValor] = useState<TipoProveedor | "">(tipo ?? "");
  const [error, setError] = useState(false);

  function cambiar(nuevo: string) {
    const tipoNuevo = nuevo === "" ? null : (nuevo as TipoProveedor);
    setValor((tipoNuevo ?? "") as TipoProveedor | "");
    setError(false);
    startTransition(async () => {
      const result = await setTipoProveedor(proveedorId, tipoNuevo);
      if (result.error) setError(true);
    });
  }

  return (
    <select
      value={valor}
      onChange={(e) => cambiar(e.target.value)}
      disabled={isPending}
      className={`rounded-md border px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50 ${
        error ? "border-red-400" : "border-slate-300"
      } ${valor === "" ? "text-slate-400" : "text-slate-900"}`}
    >
      <option value="">Sin clasificar</option>
      {TIPOS_PROVEEDOR.map((t) => (
        <option key={t} value={t}>
          {ETIQUETAS_TIPO[t]}
        </option>
      ))}
    </select>
  );
}
