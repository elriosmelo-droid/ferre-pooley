"use client";

import { useState, useTransition } from "react";
import { eliminarUsuario } from "./actions";

export function EliminarUsuarioButton({
  id,
  email,
}: {
  id: string;
  email: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onEliminar() {
    if (!confirm(`¿Eliminar al usuario ${email}? Esta acción no se puede deshacer.`)) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await eliminarUsuario(id);
      if (res.error) setError(res.error);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onEliminar}
        disabled={pending}
        className="text-sm font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
      >
        {pending ? "Eliminando…" : "Eliminar"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
