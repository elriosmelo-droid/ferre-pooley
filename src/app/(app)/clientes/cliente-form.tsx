"use client";

import { useActionState } from "react";
import Link from "next/link";
import { FieldErrors, inputClass, labelClass } from "@/components/form-ui";
import type { ClienteFormState } from "./actions";

type ClienteFormProps = {
  action: (
    prevState: ClienteFormState,
    formData: FormData
  ) => Promise<ClienteFormState>;
  cliente?: {
    nombre: string;
    rut: string | null;
    correo: string;
    telefono: string | null;
    direccion: string | null;
  };
  submitLabel: string;
};

export function ClienteForm({ action, cliente, submitLabel }: ClienteFormProps) {
  const [state, formAction, isPending] = useActionState(action, {});

  return (
    <form action={formAction} className="flex max-w-lg flex-col gap-4">
      <div>
        <label htmlFor="nombre" className={labelClass}>
          Nombre *
        </label>
        <input
          id="nombre"
          name="nombre"
          type="text"
          required
          defaultValue={cliente?.nombre ?? ""}
          className={inputClass}
        />
        <FieldErrors errors={state.fieldErrors?.nombre} />
      </div>

      <div>
        <label htmlFor="rut" className={labelClass}>
          RUT
        </label>
        <input
          id="rut"
          name="rut"
          type="text"
          defaultValue={cliente?.rut ?? ""}
          className={inputClass}
        />
        <FieldErrors errors={state.fieldErrors?.rut} />
      </div>

      <div>
        <label htmlFor="correo" className={labelClass}>
          Correo *
        </label>
        <input
          id="correo"
          name="correo"
          type="email"
          required
          defaultValue={cliente?.correo ?? ""}
          className={inputClass}
        />
        <FieldErrors errors={state.fieldErrors?.correo} />
      </div>

      <div>
        <label htmlFor="telefono" className={labelClass}>
          Teléfono
        </label>
        <input
          id="telefono"
          name="telefono"
          type="tel"
          defaultValue={cliente?.telefono ?? ""}
          className={inputClass}
        />
        <FieldErrors errors={state.fieldErrors?.telefono} />
      </div>

      <div>
        <label htmlFor="direccion" className={labelClass}>
          Dirección
        </label>
        <input
          id="direccion"
          name="direccion"
          type="text"
          defaultValue={cliente?.direccion ?? ""}
          className={inputClass}
        />
        <FieldErrors errors={state.fieldErrors?.direccion} />
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <div className="mt-2 flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
        >
          {isPending ? "Guardando…" : submitLabel}
        </button>
        <Link
          href="/clientes"
          className="rounded-md px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100"
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
