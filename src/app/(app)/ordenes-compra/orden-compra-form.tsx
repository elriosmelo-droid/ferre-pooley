"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { FieldErrors, inputClass, labelClass } from "@/components/form-ui";
import { formatCLP } from "@/lib/money";
import { calcularTotales } from "@/lib/totals";
import type { OrdenCompraFormState } from "./actions";

type ProveedorOption = {
  id: string;
  razon_social: string | null;
  rut: string;
  correo: string | null;
};

type ProductoOption = {
  id: string;
  sku: string;
  descripcion: string;
};

export type OrdenCompraItemInput = {
  producto_id: string | null;
  sku: string;
  descripcion: string;
  cantidad: number;
  precio: number;
};

type OrdenCompraFormProps = {
  proveedores: ProveedorOption[];
  productos: ProductoOption[];
  orden?: {
    proveedor_id: string;
    notas: string | null;
    items: OrdenCompraItemInput[];
  };
  action: (
    prevState: OrdenCompraFormState,
    formData: FormData
  ) => Promise<OrdenCompraFormState>;
};

const itemInputClass =
  "w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";

// Los campos numéricos admiten "" para poder dejarse vacíos mientras se editan
// (si no, el 0 quedaría pegado). Se interpretan como 0 al calcular y serializar.
type CampoNumerico = number | "";
type ItemRow = {
  uid: string;
  producto_id: string | null;
  sku: string;
  descripcion: string;
  cantidad: CampoNumerico;
  precio: CampoNumerico;
};

const aNumero = (v: CampoNumerico) => (v === "" ? 0 : v);

function parseEntero(valor: string): CampoNumerico {
  if (valor === "") return "";
  const n = Math.trunc(Number(valor));
  return Number.isNaN(n) ? "" : Math.max(0, n);
}

function nombreProveedor(p: ProveedorOption) {
  return p.razon_social || p.rut;
}

export function OrdenCompraForm({
  proveedores,
  productos,
  orden,
  action,
}: OrdenCompraFormProps) {
  const [state, formAction, isPending] = useActionState(action, {});
  const [items, setItems] = useState<ItemRow[]>(() =>
    (orden?.items ?? []).map((item, i) => ({ ...item, uid: `init-${i}` }))
  );
  const totales = calcularTotales(
    items.map((i) => ({
      cantidad: aNumero(i.cantidad),
      precio: aNumero(i.precio),
    }))
  );

  function agregarProducto(producto: ProductoOption) {
    setItems((prev) => [
      ...prev,
      {
        uid: crypto.randomUUID(),
        producto_id: producto.id,
        sku: producto.sku,
        descripcion: producto.descripcion,
        cantidad: 1,
        precio: "",
      },
    ]);
  }

  function agregarItemLibre() {
    setItems((prev) => [
      ...prev,
      {
        uid: crypto.randomUUID(),
        producto_id: null,
        sku: "",
        descripcion: "",
        cantidad: 1,
        precio: "",
      },
    ]);
  }

  function actualizarItem(
    index: number,
    cambios: Partial<Omit<ItemRow, "uid">>
  ) {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...cambios } : item))
    );
  }

  function eliminarItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input
        type="hidden"
        name="items"
        value={JSON.stringify(
          items.map((item) => ({
            producto_id: item.producto_id,
            sku: item.sku,
            descripcion: item.descripcion,
            cantidad: aNumero(item.cantidad),
            precio: aNumero(item.precio),
          }))
        )}
      />

      <div className="max-w-2xl">
        <label htmlFor="proveedor_id" className={labelClass}>
          Proveedor *
        </label>
        <select
          id="proveedor_id"
          name="proveedor_id"
          required
          defaultValue={orden?.proveedor_id ?? ""}
          className={inputClass}
        >
          <option value="" disabled>
            Selecciona un proveedor…
          </option>
          {proveedores.map((p) => (
            <option key={p.id} value={p.id}>
              {nombreProveedor(p)}
              {p.correo ? "" : " (sin correo)"}
            </option>
          ))}
        </select>
        <FieldErrors errors={state.fieldErrors?.proveedor_id} />
        <p className="mt-1 text-xs text-slate-500">
          El proveedor necesita correo para poder enviarle la orden. Se carga en
          Proveedores.
        </p>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-900">Ítems</h2>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <select
            value=""
            onChange={(e) => {
              const producto = productos.find((p) => p.id === e.target.value);
              if (producto) agregarProducto(producto);
            }}
            className="w-full max-w-md rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            <option value="">Agregar producto del catálogo…</option>
            {productos.map((producto) => (
              <option key={producto.id} value={producto.id}>
                {producto.sku} — {producto.descripcion}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={agregarItemLibre}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            Agregar ítem libre
          </button>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="w-32 px-3 py-3">SKU</th>
                <th className="min-w-56 px-3 py-3">Descripción</th>
                <th className="w-24 px-3 py-3">Cantidad</th>
                <th className="w-32 px-3 py-3">Precio compra</th>
                <th className="w-32 px-3 py-3 text-right">Total línea</th>
                <th className="w-12 px-3 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                    Agrega productos del catálogo o ítems libres.
                  </td>
                </tr>
              ) : (
                items.map((item, index) => {
                  const esLibre = item.producto_id === null;
                  return (
                    <tr key={item.uid} className="text-slate-700">
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={item.sku}
                          readOnly={!esLibre}
                          aria-label="SKU"
                          onChange={(e) =>
                            actualizarItem(index, { sku: e.target.value })
                          }
                          className={`${itemInputClass} ${esLibre ? "" : "bg-slate-50 text-slate-500"}`}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={item.descripcion}
                          readOnly={!esLibre}
                          aria-label="Descripción"
                          onChange={(e) =>
                            actualizarItem(index, {
                              descripcion: e.target.value,
                            })
                          }
                          className={`${itemInputClass} ${esLibre ? "" : "bg-slate-50 text-slate-500"}`}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={item.cantidad}
                          aria-label="Cantidad"
                          onChange={(e) =>
                            actualizarItem(index, {
                              cantidad: parseEntero(e.target.value),
                            })
                          }
                          className={itemInputClass}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={item.precio}
                          aria-label="Precio de compra"
                          onChange={(e) =>
                            actualizarItem(index, {
                              precio: parseEntero(e.target.value),
                            })
                          }
                          className={itemInputClass}
                        />
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-slate-900">
                        {formatCLP(aNumero(item.cantidad) * aNumero(item.precio))}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => eliminarItem(index)}
                          aria-label="Eliminar ítem"
                          title="Eliminar ítem"
                          className="text-sm font-medium text-red-600 hover:text-red-800"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <FieldErrors errors={state.fieldErrors?.items} />
      </div>

      <div className="max-w-2xl">
        <label htmlFor="notas" className={labelClass}>
          Notas
        </label>
        <textarea
          id="notas"
          name="notas"
          rows={3}
          defaultValue={orden?.notas ?? ""}
          className={inputClass}
        />
        <FieldErrors errors={state.fieldErrors?.notas} />
      </div>

      <div className="max-w-xs rounded-xl border border-slate-200 bg-white p-4 text-sm">
        <dl className="flex flex-col gap-2">
          <div className="flex justify-between text-slate-600">
            <dt>Subtotal neto</dt>
            <dd>{formatCLP(totales.subtotalNeto)}</dd>
          </div>
          <div className="flex justify-between text-slate-600">
            <dt>IVA (19%)</dt>
            <dd>{formatCLP(totales.iva)}</dd>
          </div>
          <div className="flex justify-between border-t border-slate-200 pt-2 font-semibold text-slate-900">
            <dt>Total</dt>
            <dd>{formatCLP(totales.total)}</dd>
          </div>
        </dl>
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
        >
          {isPending ? "Guardando…" : "Guardar borrador"}
        </button>
        <Link
          href="/ordenes-compra"
          className="rounded-md px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100"
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
