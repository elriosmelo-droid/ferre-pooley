"use client";

import { useState } from "react";

export function CopiarLink({ url }: { url: string }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // El portapapeles puede no estar disponible (p. ej. sin HTTPS)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <code className="max-w-full truncate rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
        {url}
      </code>
      <button
        type="button"
        onClick={copiar}
        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
      >
        {copiado ? "Copiado" : "Copiar"}
      </button>
    </div>
  );
}
