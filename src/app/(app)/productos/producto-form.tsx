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
    sku_proveedor: string | null;
    descripcion: string;
    marca: string | null;
    unidad: string | null;
    proveedor_id: string | null;
    costo: number;
    precio: number;
    activo: boolean;
  };
  submitLabel: string;
  // Sin «ver costos» no se muestra ni se edita el costo.
  verCostos?: boolean;
  // Solo admin ve proveedores; sin la lista no se muestra el campo.
  proveedores?: { id: string; nombre: string }[];
};

const UNIDADES = ["unidad", "caja", "paquete", "metro", "kg", "litro", "rollo", "par", "juego"];

export function ProductoForm({
  action,
  producto,
  submitLabel,
  verCostos = true,
  proveedores,
}: ProductoFormProps) {
  const [state, formAction, isPending] = useActionState(action, {});

  return (
    <form action={formAction} className="flex max-w-lg flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="sku" className={labelClass}>
            SKU propio *
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
          <label htmlFor="sku_proveedor" className={labelClass}>
            SKU proveedor
          </label>
          <input
            id="sku_proveedor"
            name="sku_proveedor"
            type="text"
            defaultValue={producto?.sku_proveedor ?? ""}
            className={inputClass}
          />
          <FieldErrors errors={state.fieldErrors?.sku_proveedor} />
        </div>
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
          <label htmlFor="marca" className={labelClass}>
            Marca
          </label>
          <input
            id="marca"
            name="marca"
            type="text"
            defaultValue={producto?.marca ?? ""}
            className={inputClass}
          />
          <FieldErrors errors={state.fieldErrors?.marca} />
        </div>

        <div>
          <label htmlFor="unidad" className={labelClass}>
            Unidad de medida
          </label>
          <input
            id="unidad"
            name="unidad"
            type="text"
            list="unidades"
            placeholder="unidad, caja, metro…"
            defaultValue={producto?.unidad ?? ""}
            className={inputClass}
          />
          <datalist id="unidades">
            {UNIDADES.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
          <FieldErrors errors={state.fieldErrors?.unidad} />
        </div>
      </div>

      {proveedores && (
        <div>
          <label htmlFor="proveedor_id" className={labelClass}>
            Proveedor
          </label>
          <select
            id="proveedor_id"
            name="proveedor_id"
            defaultValue={producto?.proveedor_id ?? ""}
            className={inputClass}
          >
            <option value="">— Sin proveedor —</option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {verCostos && (
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
        )}

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
          className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
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
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
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
