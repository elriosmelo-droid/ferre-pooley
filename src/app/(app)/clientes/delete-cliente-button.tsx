"use client";

import { useTransition } from "react";
import { eliminarCliente } from "./actions";

export function DeleteClienteButton({
  id,
  nombre,
}: {
  id: string;
  nombre: string;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        if (!confirm(`¿Eliminar al cliente "${nombre}"?`)) return;
        startTransition(async () => {
          const result = await eliminarCliente(id);
          if (result?.error) {
            alert(result.error);
          }
        });
      }}
      className="text-sm font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
    >
      Eliminar
    </button>
  );
}
