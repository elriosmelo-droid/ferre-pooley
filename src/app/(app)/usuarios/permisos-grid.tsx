"use client";

import { MODULOS, type Nivel, type Permisos } from "@/lib/auth/permisos";

type Opcion = "" | Nivel;

const OPCIONES: { valor: Opcion; label: string }[] = [
  { valor: "", label: "Sin acceso" },
  { valor: "lectura", label: "Lectura" },
  { valor: "escritura", label: "Lectura y escritura" },
];

// Grilla de permisos por módulo: un radio por fila (no se puede marcar
// escritura sin lectura). Los módulos de solo lectura no ofrecen escritura.
export function PermisosGrid({
  value,
  onChange,
}: {
  value: Permisos;
  onChange: (p: Permisos) => void;
}) {
  function setModulo(clave: (typeof MODULOS)[number]["clave"], v: Opcion) {
    const next = { ...value };
    if (v === "") delete next[clave];
    else next[clave] = v;
    onChange(next);
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2">Módulo</th>
            {OPCIONES.map((o) => (
              <th key={o.valor} className="px-2 py-2 text-center">
                {o.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {MODULOS.map((m) => {
            const actual: Opcion = value[m.clave] ?? "";
            return (
              <tr key={m.clave}>
                <td className="px-3 py-2 text-slate-700">{m.label}</td>
                {OPCIONES.map((o) => {
                  const deshabilitado = o.valor === "escritura" && !m.escritura;
                  return (
                    <td key={o.valor} className="px-2 py-2 text-center">
                      {deshabilitado ? (
                        <span className="text-slate-300">—</span>
                      ) : (
                        <input
                          type="radio"
                          name={`perm-${m.clave}`}
                          aria-label={`${m.label}: ${o.label}`}
                          checked={actual === o.valor}
                          onChange={() => setModulo(m.clave, o.valor)}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      <label className="flex items-center gap-2 border-t border-slate-200 px-3 py-3 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={value.ver_costos === true}
          onChange={(e) => onChange({ ...value, ver_costos: e.target.checked })}
        />
        Ver costos, márgenes y flete
      </label>
      {value.finanzas && !value.ver_costos && (
        <p className="px-3 pb-3 text-xs text-amber-700">
          Finanzas requiere «Ver costos, márgenes y flete».
        </p>
      )}
    </div>
  );
}
