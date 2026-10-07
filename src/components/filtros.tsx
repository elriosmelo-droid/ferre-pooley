"use client";

import { useMemo } from "react";
import { hoyChile, ultimosMeses } from "@/lib/fecha";

const inputCls =
  "w-28 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none";

// Atajos por mes: el mes en curso y los dos anteriores. Setean desde/hasta, así
// que no son un filtro aparte y se pueden ajustar a mano después.
export function AtajosMes({
  desde,
  hasta,
  onChange,
}: {
  desde: string;
  hasta: string;
  onChange: (desde: string, hasta: string) => void;
}) {
  const meses = useMemo(() => ultimosMeses(hoyChile(), 3), []);
  const activo = meses.find((m) => m.desde === desde && m.hasta === hasta);
  return (
    <div className="flex flex-col gap-1 text-xs text-slate-500">
      Mes
      <div className="flex gap-1">
        {meses.map((m) => (
          <button
            key={m.clave}
            type="button"
            onClick={() =>
              activo?.clave === m.clave ? onChange("", "") : onChange(m.desde, m.hasta)
            }
            className={`rounded-lg border px-3 py-2 text-sm ${
              activo?.clave === m.clave
                ? "border-brand-500 bg-brand-50 font-semibold text-brand-700"
                : "border-slate-300 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {m.etiqueta}
          </button>
        ))}
      </div>
    </div>
  );
}

export function RangoMonto({
  min,
  max,
  onChange,
}: {
  min: string;
  max: string;
  onChange: (min: string, max: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1 text-xs text-slate-500">
      Monto total
      <div className="flex items-center gap-1">
        <input
          type="number"
          min={0}
          inputMode="numeric"
          placeholder="Mín."
          value={min}
          onChange={(e) => onChange(e.target.value, max)}
          className={inputCls}
        />
        <span>–</span>
        <input
          type="number"
          min={0}
          inputMode="numeric"
          placeholder="Máx."
          value={max}
          onChange={(e) => onChange(min, e.target.value)}
          className={inputCls}
        />
      </div>
    </div>
  );
}

// Valor absoluto: una nota de crédito de -50.000 entra en un rango de 50.000.
export function dentroDeRango(valor: number, min: string, max: string): boolean {
  const v = Math.abs(valor);
  if (min !== "" && v < Number(min)) return false;
  if (max !== "" && v > Number(max)) return false;
  return true;
}

export function hayRango(min: string, max: string): boolean {
  return min !== "" || max !== "";
}
