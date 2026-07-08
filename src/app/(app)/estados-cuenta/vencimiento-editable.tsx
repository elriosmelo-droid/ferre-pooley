"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setVencimientoManual } from "./actions";

function fmt(iso: string | null) {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}-${m}-${a}`;
}

export function VencimientoEditable({
  ventaId,
  vencimiento,
  manual,
  vencida,
}: {
  ventaId: string;
  vencimiento: string | null;
  manual: boolean;
  vencida: boolean;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(vencimiento?.slice(0, 10) ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function guardar(fecha: string) {
    setError(null);
    startTransition(async () => {
      const res = await setVencimientoManual(ventaId, fecha);
      if (res.error) {
        setError(res.error);
        return;
      }
      setEditando(false);
      router.refresh();
    });
  }

  if (editando) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1">
          <input
            type="date"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            className="rounded border border-slate-300 px-1.5 py-1 text-xs text-slate-900 focus:border-brand-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => guardar(valor)}
            disabled={pending}
            className="rounded bg-brand-600 px-2 py-1 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            OK
          </button>
          <button
            type="button"
            onClick={() => {
              setEditando(false);
              setValor(vencimiento?.slice(0, 10) ?? "");
              setError(null);
            }}
            className="rounded px-1.5 py-1 text-xs text-slate-500 hover:bg-slate-100"
          >
            ✕
          </button>
        </div>
        {manual && (
          <button
            type="button"
            onClick={() => guardar("")}
            disabled={pending}
            className="text-left text-[11px] text-slate-500 underline hover:text-slate-700"
          >
            Restaurar calculado
          </button>
        )}
        {error && <span className="text-[11px] text-red-600">{error}</span>}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditando(true)}
      title="Editar vencimiento"
      className={`group inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-slate-100 ${
        vencida ? "font-semibold text-red-600" : "text-slate-700"
      }`}
    >
      {fmt(vencimiento)}
      {vencida && " ⚠"}
      {manual && (
        <span className="rounded bg-blue-100 px-1 text-[10px] font-medium text-blue-700">
          editado
        </span>
      )}
      <svg
        className="opacity-0 transition-opacity group-hover:opacity-60"
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
    </button>
  );
}
