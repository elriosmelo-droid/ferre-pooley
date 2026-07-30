"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { FieldErrors, inputClass, labelClass } from "@/components/form-ui";
import { formatCLP } from "@/lib/money";
import {
  calcularTotales,
  descuentoUnitario,
  markupPctDesdePrecio,
  precioDesdeMarkupPct,
} from "@/lib/totals";
import { MEDIOS_PAGO } from "@/lib/medio-pago";
import type { CotizacionFormState } from "./actions";

type ClienteOption = { id: string; nombre: string; rut: string | null };

type ProductoOption = {
  id: string;
  sku: string;
  descripcion: string;
  costo: number;
  precio: number;
};

export type CotizacionItemInput = {
  producto_id: string | null;
  sku: string;
  descripcion: string;
  cantidad: number;
  costo: number;
  precio: number;
  // Flete unitario: interno, se suma al precio para el cliente.
  flete: number;
  // Descuento porcentual (0–100) sobre el precio.
  descuento: number;
};

type CotizacionFormProps = {
  clientes: ClienteOption[];
  productos: ProductoOption[];
  cotizacion?: {
    cliente_id: string;
    fecha_validez: string;
    medio_pago: string[] | null;
    notas: string | null;
    items: CotizacionItemInput[];
  };
  action: (
    prevState: CotizacionFormState,
    formData: FormData
  ) => Promise<CotizacionFormState>;
};

function fechaValidezDefault() {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

const itemInputClass =
  "w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";

// uid: clave estable de React por fila; se descarta al serializar al servidor.
// Los campos numéricos admiten "" para poder dejarse vacíos mientras se editan
// (si no, el 0 quedaría "pegado" e imposible de borrar). Se interpretan como 0
// al calcular totales y al serializar.
type CampoNumerico = number | "";
type ItemRow = {
  uid: string;
  producto_id: string | null;
  sku: string;
  descripcion: string;
  cantidad: CampoNumerico;
  costo: CampoNumerico;
  precio: CampoNumerico;
  flete: CampoNumerico;
  descuento: CampoNumerico;
  // Markup % sobre el costo. Se guarda como TEXTO (no número) porque admite
  // decimales y estados intermedios de tecleo ("30.", "-") que un number
  // rompería. No se envía al servidor: el precio ya lo refleja.
  markup: string;
};

const aNumero = (v: CampoNumerico) => (v === "" ? 0 : v);

// Parsea lo que el usuario escribe: vacío se mantiene vacío; texto inválido
// también; números se truncan a entero ≥ 0.
function parseEntero(valor: string): CampoNumerico {
  if (valor === "") return "";
  const n = Math.trunc(Number(valor));
  return Number.isNaN(n) ? "" : Math.max(0, n);
}

// Porcentaje de descuento: entero entre 0 y 100.
function parsePorcentaje(valor: string): CampoNumerico {
  if (valor === "") return "";
  const n = Math.trunc(Number(valor));
  return Number.isNaN(n) ? "" : Math.min(100, Math.max(0, n));
}

// Deja pasar solo lo que puede formar un markup: un signo menos inicial
// (vender bajo costo es válido), dígitos y un separador decimal. Se conserva el
// texto crudo para no pelear con el usuario mientras teclea "30." o "-".
function sanitizarMarkup(valor: string): string {
  const limpio = valor.replace(",", ".").replace(/[^\d.-]/g, "");
  const negativo = limpio.startsWith("-");
  const [entera, ...resto] = limpio.replace(/-/g, "").split(".");
  const decimal = resto.length > 0 ? `.${resto.join("").slice(0, 1)}` : "";
  return `${negativo ? "-" : ""}${entera}${decimal}`;
}

// Número utilizable, o null si el texto todavía no es un número válido
// ("", "-", "."). Evita recalcular el precio con basura a medio escribir.
function markupNumero(texto: string): number | null {
  if (texto === "" || texto === "-" || texto === "." || texto === "-.") {
    return null;
  }
  const n = Number(texto);
  return Number.isFinite(n) ? n : null;
}

// Markup derivado que se muestra en el input: entero cuando da redondo, con un
// decimal cuando no. "" cuando es indefinido (costo 0).
function formatMarkup(pct: number | null): string {
  if (pct === null) return "";
  const redondeado = Math.round(pct * 10) / 10;
  return Number.isInteger(redondeado)
    ? String(redondeado)
    : redondeado.toFixed(1);
}

export function CotizacionForm({
  clientes,
  productos,
  cotizacion,
  action,
}: CotizacionFormProps) {
  const [state, formAction, isPending] = useActionState(action, {});
  const [items, setItems] = useState<ItemRow[]>(() =>
    (cotizacion?.items ?? []).map((item, i) => ({
      ...item,
      uid: `init-${i}`,
      markup: formatMarkup(markupPctDesdePrecio(item.precio, item.costo)),
    }))
  );
  const totales = calcularTotales(
    items.map((i) => ({
      cantidad: aNumero(i.cantidad),
      precio: aNumero(i.precio),
      flete: aNumero(i.flete),
      descuento: aNumero(i.descuento),
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
        costo: producto.costo,
        precio: producto.precio,
        flete: 0,
        descuento: 0,
        markup: formatMarkup(
          markupPctDesdePrecio(producto.precio, producto.costo)
        ),
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
        costo: "",
        precio: "",
        flete: "",
        descuento: "",
        markup: "",
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

  // Variante que calcula los cambios a partir de la fila actual. Se lee el
  // estado dentro del updater para no trabajar sobre un `items` desactualizado.
  function actualizarItemCon(
    index: number,
    calcular: (item: ItemRow) => Partial<Omit<ItemRow, "uid">>
  ) {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...calcular(item) } : item))
    );
  }

  // Markup y precio están acoplados: el campo que toca el usuario manda y el
  // otro se recalcula solo. Editar el costo NO mueve el precio (sería cambiarle
  // la cotización al cliente sin pedirlo): recalcula el markup.
  function cambiarMarkup(index: number, texto: string) {
    const markup = sanitizarMarkup(texto);
    actualizarItemCon(index, (item) => {
      const pct = markupNumero(markup);
      if (pct === null) return { markup };
      const precio = precioDesdeMarkupPct(aNumero(item.costo), pct);
      // Sin costo el precio no se puede derivar: se deja el markup escrito.
      return precio === null ? { markup } : { markup, precio };
    });
  }

  function cambiarPrecio(index: number, texto: string) {
    const precio = parseEntero(texto);
    actualizarItemCon(index, (item) => ({
      precio,
      markup:
        precio === ""
          ? ""
          : formatMarkup(markupPctDesdePrecio(precio, aNumero(item.costo))),
    }));
  }

  function cambiarCosto(index: number, texto: string) {
    const costo = parseEntero(texto);
    actualizarItemCon(index, (item) => ({
      costo,
      markup:
        costo === "" || item.precio === ""
          ? ""
          : formatMarkup(markupPctDesdePrecio(aNumero(item.precio), costo)),
    }));
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
            costo: aNumero(item.costo),
            precio: aNumero(item.precio),
            flete: aNumero(item.flete),
            descuento: aNumero(item.descuento),
          }))
        )}
      />

      <div className="grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="cliente_id" className={labelClass}>
            Cliente *
          </label>
          <select
            id="cliente_id"
            name="cliente_id"
            required
            defaultValue={cotizacion?.cliente_id ?? ""}
            className={inputClass}
          >
            <option value="" disabled>
              Selecciona un cliente…
            </option>
            {clientes.map((cliente) => (
              <option key={cliente.id} value={cliente.id}>
                {cliente.nombre}
                {cliente.rut ? ` (${cliente.rut})` : ""}
              </option>
            ))}
          </select>
          <FieldErrors errors={state.fieldErrors?.cliente_id} />
        </div>

        <div>
          <label htmlFor="fecha_validez" className={labelClass}>
            Válida hasta *
          </label>
          <input
            id="fecha_validez"
            name="fecha_validez"
            type="date"
            required
            defaultValue={cotizacion?.fecha_validez ?? fechaValidezDefault()}
            className={inputClass}
          />
          <FieldErrors errors={state.fieldErrors?.fecha_validez} />
        </div>

        <div className="sm:col-span-2">
          <span className={labelClass}>Medios de pago *</span>
          <div className="mt-1 flex flex-wrap gap-x-5 gap-y-2">
            {MEDIOS_PAGO.map((m) => (
              <label
                key={m.valor}
                className="flex items-center gap-2 text-sm text-slate-700"
              >
                <input
                  type="checkbox"
                  name="medio_pago"
                  value={m.valor}
                  defaultChecked={cotizacion?.medio_pago?.includes(m.valor) ?? false}
                  className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                />
                {m.etiqueta}
              </label>
            ))}
          </div>
          <FieldErrors errors={state.fieldErrors?.medio_pago} />
        </div>
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
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="w-32 px-3 py-3">SKU</th>
                <th className="min-w-56 px-3 py-3">Descripción</th>
                <th className="w-24 px-3 py-3">Cantidad</th>
                <th className="w-28 px-3 py-3">Costo</th>
                <th className="w-24 px-3 py-3" title="Markup sobre el costo: precio = costo × (1 + margen/100)">
                  Margen %
                </th>
                <th className="w-28 px-3 py-3">Precio</th>
                <th className="w-28 px-3 py-3">Flete unit.</th>
                <th className="w-24 px-3 py-3">Desc. %</th>
                <th className="w-32 px-3 py-3 text-right">Total línea</th>
                <th className="w-12 px-3 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-slate-500">
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
                          value={item.costo}
                          aria-label="Costo"
                          onChange={(e) => cambiarCosto(index, e.target.value)}
                          className={itemInputClass}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={item.markup}
                          aria-label="Margen porcentual sobre el costo"
                          title={
                            aNumero(item.costo) > 0
                              ? "Escribe el margen y el precio se calcula solo"
                              : "Carga primero el costo para poder usar el margen"
                          }
                          placeholder={aNumero(item.costo) > 0 ? "" : "—"}
                          onChange={(e) => cambiarMarkup(index, e.target.value)}
                          className={`${itemInputClass} ${
                            aNumero(item.costo) > 0 ? "" : "bg-slate-50"
                          }`}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={item.precio}
                          aria-label="Precio"
                          onChange={(e) => cambiarPrecio(index, e.target.value)}
                          className={itemInputClass}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={item.flete}
                          aria-label="Flete unitario"
                          onChange={(e) =>
                            actualizarItem(index, {
                              flete: parseEntero(e.target.value),
                            })
                          }
                          className={itemInputClass}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={1}
                          value={item.descuento}
                          aria-label="Descuento porcentual"
                          onChange={(e) =>
                            actualizarItem(index, {
                              descuento: parsePorcentaje(e.target.value),
                            })
                          }
                          className={itemInputClass}
                        />
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-slate-900">
                        {formatCLP(
                          aNumero(item.cantidad) *
                            (aNumero(item.precio) -
                              descuentoUnitario(
                                aNumero(item.precio),
                                aNumero(item.descuento)
                              ) +
                              aNumero(item.flete))
                        )}
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

      <div className="grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
        <p className="text-xs text-slate-500">
          El flete unitario se suma al precio de cada ítem. El cliente ve el
          precio final sin una línea de flete separada.
        </p>
        <p className="text-xs text-slate-500">
          <strong className="font-semibold">Margen %</strong> se carga sobre el
          costo (costo 1.000 + 30% = 1.300) y se sincroniza con el precio en
          ambos sentidos. Ojo: el «Margen (interno)» del detalle mide el margen
          sobre la venta, así que para esa línea mostrará 23,1%. El descuento y
          el flete no entran en este cálculo.
        </p>
      </div>

      <div className="max-w-2xl">
        <label htmlFor="notas" className={labelClass}>
          Notas
        </label>
        <textarea
          id="notas"
          name="notas"
          rows={3}
          defaultValue={cotizacion?.notas ?? ""}
          className={inputClass}
        />
        <FieldErrors errors={state.fieldErrors?.notas} />
      </div>

      <div className="max-w-xs rounded-xl border border-slate-200 bg-white p-4 text-sm">
        <dl className="flex flex-col gap-2">
          {totales.descuento > 0 && (
            <>
              <div className="flex justify-between text-slate-600">
                <dt>Subtotal bruto</dt>
                <dd>{formatCLP(totales.subtotalBruto)}</dd>
              </div>
              <div className="flex justify-between text-slate-600">
                <dt>Descuento</dt>
                <dd>-{formatCLP(totales.descuento)}</dd>
              </div>
            </>
          )}
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
          href="/cotizaciones"
          className="rounded-md px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100"
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
