"use client";

import { useActionState } from "react";
import Link from "next/link";
import { FieldErrors, inputClass, labelClass } from "@/components/form-ui";
import type { ProductoFormState } from "./actions";

type ProductoFormProps = {
  action: (
    prevState: ProductoFormState,
    formData: FormData
  ) => Promise<ProductoFormState>;
  producto?: {
    sku: string;
    descripcion: string;
    costo: number;
    precio: number;
    activo: boolean;
  };
  submitLabel: string;
};

export function ProductoForm({
  action,
  producto,
  submitLabel,
}: ProductoFormProps) {
  const [state, formAction, isPending] = useActionState(action, {});

  return (
    <form action={formAction} className="flex max-w-lg flex-col gap-4">
      <div>
        <label htmlFor="sku" className={labelClass}>
          SKU *
        </label>
        <input
          id="sku"
          name="sku"
          type="text"
          required
          defaultValue={producto?.sku ?? ""}
          className={inputClass}
        />
        <FieldErrors errors={state.fieldErrors?.sku} />
      </div>

      <div>
        <label htmlFor="descripcion" className={labelClass}>
          Descripción *
        </label>
        <input
          id="descripcion"
          name="descripcion"
          type="text"
          required
          defaultValue={producto?.descripcion ?? ""}
          className={inputClass}
        />
        <FieldErrors errors={state.fieldErrors?.descripcion} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="costo" className={labelClass}>
            Costo (CLP) *
          </label>
          <input
            id="costo"
            name="costo"
            type="number"
            required
            min={0}
            step={1}
            defaultValue={producto?.costo ?? 0}
            className={inputClass}
          />
          <FieldErrors errors={state.fieldErrors?.costo} />
        </div>

        <div>
          <label htmlFor="precio" className={labelClass}>
            Precio (CLP) *
          </label>
          <input
            id="precio"
            name="precio"
            type="number"
            required
            min={0}
            step={1}
            defaultValue={producto?.precio ?? 0}
            className={inputClass}
          />
          <FieldErrors errors={state.fieldErrors?.precio} />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          id="activo"
          name="activo"
          type="checkbox"
          defaultChecked={producto?.activo ?? true}
          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
        />
        <label htmlFor="activo" className="text-sm font-medium text-slate-700">
          Producto activo
        </label>
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
          href="/productos"
          className="rounded-md px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100"
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
