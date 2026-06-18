"use client";

import { useActionState } from "react";
import { inputClass, labelClass, FieldErrors } from "@/components/form-ui";
import { guardarPerfil, type PerfilFormState } from "./actions";

export type PerfilData = {
  nombre: string | null;
  razon_social: string | null;
  rut_empresa: string | null;
  direccion_empresa: string | null;
  telefono_empresa: string | null;
  correo_aviso: string | null;
};

const initialState: PerfilFormState = {};

export function PerfilForm({
  perfil,
  correoCuenta,
}: {
  perfil: PerfilData | null;
  correoCuenta: string;
}) {
  const [state, formAction, isPending] = useActionState(
    guardarPerfil,
    initialState
  );

  return (
    <form
      action={formAction}
      className="flex max-w-2xl flex-col gap-4 rounded-xl border border-slate-200 bg-white p-6"
    >
      <div>
        <label className={labelClass} htmlFor="correo_cuenta">
          Correo de la cuenta
        </label>
        <input
          id="correo_cuenta"
          type="email"
          value={correoCuenta}
          readOnly
          disabled
          className={`${inputClass} bg-slate-50 text-slate-500`}
        />
      </div>

      <div>
        <label className={labelClass} htmlFor="nombre">
          Nombre
        </label>
        <input
          id="nombre"
          name="nombre"
          type="text"
          defaultValue={perfil?.nombre ?? ""}
          className={inputClass}
        />
        <FieldErrors errors={state.fieldErrors?.nombre} />
      </div>

      <div>
        <label className={labelClass} htmlFor="razon_social">
          Razón social
        </label>
        <input
          id="razon_social"
          name="razon_social"
          type="text"
          defaultValue={perfil?.razon_social ?? ""}
          className={inputClass}
        />
        <FieldErrors errors={state.fieldErrors?.razon_social} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="rut_empresa">
            RUT de la empresa
          </label>
          <input
            id="rut_empresa"
            name="rut_empresa"
            type="text"
            defaultValue={perfil?.rut_empresa ?? ""}
            className={inputClass}
          />
          <FieldErrors errors={state.fieldErrors?.rut_empresa} />
        </div>

        <div>
          <label className={labelClass} htmlFor="telefono_empresa">
            Teléfono de la empresa
          </label>
          <input
            id="telefono_empresa"
            name="telefono_empresa"
            type="text"
            defaultValue={perfil?.telefono_empresa ?? ""}
            className={inputClass}
          />
          <FieldErrors errors={state.fieldErrors?.telefono_empresa} />
        </div>
      </div>

      <div>
        <label className={labelClass} htmlFor="direccion_empresa">
          Dirección de la empresa
        </label>
        <input
          id="direccion_empresa"
          name="direccion_empresa"
          type="text"
          defaultValue={perfil?.direccion_empresa ?? ""}
          className={inputClass}
        />
        <FieldErrors errors={state.fieldErrors?.direccion_empresa} />
      </div>

      <div>
        <label className={labelClass} htmlFor="correo_aviso">
          Correo de aviso
        </label>
        <input
          id="correo_aviso"
          name="correo_aviso"
          type="email"
          defaultValue={perfil?.correo_aviso ?? ""}
          className={inputClass}
        />
        <p className="mt-1 text-xs text-slate-500">
          A este correo te avisaremos cuando un cliente responda una
          cotización.
        </p>
        <FieldErrors errors={state.fieldErrors?.correo_aviso} />
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.success && (
        <p className="text-sm font-medium text-green-600">Perfil guardado</p>
      )}

      <div>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
        >
          {isPending ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </form>
  );
}
