"use client";

import { useState, useTransition } from "react";
import { setCorreoProveedor } from "./actions";

export function CorreoInput({
  proveedorId,
  correo,
}: {
  proveedorId: string;
  correo: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [valor, setValor] = useState(correo ?? "");
  const [error, setError] = useState(false);

  // Guarda al perder el foco solo si cambió, para no disparar updates inútiles.
  function guardar() {
    const limpio = valor.trim();
    if (limpio === (correo ?? "")) return;
    setError(false);
    startTransition(async () => {
      const result = await setCorreoProveedor(proveedorId, limpio);
      if (result.error) setError(true);
    });
  }

  return (
    <input
      type="email"
      value={valor}
      placeholder="correo@proveedor.cl"
      onChange={(e) => setValor(e.target.value)}
      onBlur={guardar}
      disabled={isPending}
      className={`w-full min-w-44 rounded-md border px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50 ${
        error ? "border-red-400" : "border-slate-300"
      } text-slate-900`}
    />
  );
}
