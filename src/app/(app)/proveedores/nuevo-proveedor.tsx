"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { inputClass, labelClass } from "@/components/form-ui";
import { formatearRut } from "@/lib/rut";
import { TIPOS_PROVEEDOR, ETIQUETAS_TIPO, type TipoProveedor } from "./tipos";
import { crearProveedor } from "./actions";

// Formulario para dar de alta un proveedor a mano (los del SII se siembran
// solos). Al crearse queda disponible para asignarlo en órdenes de compra.
export function NuevoProveedor() {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [rut, setRut] = useState("");
  const [razonSocial, setRazonSocial] = useState("");
  const [correo, setCorreo] = useState("");
  const [tipo, setTipo] = useState<TipoProveedor | "">("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function limpiar() {
    setRut("");
    setRazonSocial("");
    setCorreo("");
    setTipo("");
    setError(null);
  }

  function cerrar() {
    setAbierto(false);
    limpiar();
  }

  function guardar() {
    setError(null);
    startTransition(async () => {
      const res = await crearProveedor({
        rut,
        razon_social: razonSocial,
        correo,
        tipo: tipo || null,
      });
      if ("error" in res) {
        setError(res.error);
        return;
      }
      cerrar();
      router.refresh();
    });
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
      >
        Nuevo proveedor
      </button>
    );
  }

  return (
    <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="mb-4 text-sm font-semibold text-slate-900">
        Nuevo proveedor
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="np-rut" className={labelClass}>
            RUT *
          </label>
          <input
            id="np-rut"
            value={rut}
            onChange={(e) => setRut(formatearRut(e.target.value))}
            placeholder="76.109.779-2"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="np-razon" className={labelClass}>
            Razón social *
          </label>
          <input
            id="np-razon"
            value={razonSocial}
            onChange={(e) => setRazonSocial(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="np-correo" className={labelClass}>
            Correo
          </label>
          <input
            id="np-correo"
            type="email"
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
            placeholder="Para enviarle órdenes de compra"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="np-tipo" className={labelClass}>
            Tipo
          </label>
          <select
            id="np-tipo"
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoProveedor | "")}
            className={inputClass}
          >
            <option value="">Sin clasificar</option>
            {TIPOS_PROVEEDOR.map((t) => (
              <option key={t} value={t}>
                {ETIQUETAS_TIPO[t]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={guardar}
          disabled={pending}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
        >
          {pending ? "Creando…" : "Crear proveedor"}
        </button>
        <button
          type="button"
          onClick={cerrar}
          className="rounded-md px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
