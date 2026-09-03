"use client";

import { useMemo, useState, useTransition } from "react";
import { formatCLP } from "@/lib/money";
import {
  FORMAS_PAGO_COMPRA,
  FORMA_PAGO_COMPRA_LABEL,
  etiquetaItemsPago,
  normalizarItemsPago,
  formasDe,
  sumaMontos,
  admitePlazo,
  vencimientoDesde,
  montoDeuda,
  totalDeuda,
  type FormaPagoCompra,
  type FormaPagoItem,
} from "@/lib/forma-pago-compra";
import { setFormasPagoCompra } from "./actions";

const TIPO_DOC: Record<number, string> = {
  33: "Factura electrónica",
  34: "Factura exenta",
  56: "Nota de débito",
  61: "Nota de crédito",
};

export type CompraRow = {
  id: string;
  tipo_doc: number;
  rut_proveedor: string;
  razon_social: string | null;
  folio: string;
  fecha_emision: string | null;
  monto_neto: number;
  monto_iva: number;
  monto_total: number;
  // Dato manual y opcional; una compra puede tener varias formas de pago, cada
  // una con su monto. null o vacío = sin asignar.
  formas_pago: unknown;
};

// "Sin asignar" es un filtro útil por sí mismo: son las compras que faltan
// completar. Se distingue de "Todas" con un valor centinela.
const SIN_ASIGNAR = "__sin__";
// "Con deuda" cruza varias formas (cheque y crédito), así que tampoco es una
// forma concreta y necesita su propio centinela.
const CON_DEUDA = "__deuda__";

function formatFecha(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function ComprasTabla({ compras }: { compras: CompraRow[] }) {
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [proveedor, setProveedor] = useState("");
  const [tipo, setTipo] = useState("");
  const [pago, setPago] = useState("");
  // Las formas de pago viven en el estado del padre, no en cada celda: si no, al
  // cambiarlas el filtro seguiría viendo el valor viejo.
  const [items, setItems] = useState<Record<string, FormaPagoItem[]>>(() =>
    Object.fromEntries(
      compras.map((c) => [c.id, normalizarItemsPago(c.formas_pago)])
    )
  );
  const [guardando, setGuardando] = useState<string | null>(null);
  // Edición local: con montos de por medio no se guarda en cada tecla, así que la
  // celda trabaja sobre un borrador hasta que se confirma.
  const [editando, setEditando] = useState<string | null>(null);
  const [borrador, setBorrador] = useState<FormaPagoItem[]>([]);
  const [, startGuardar] = useTransition();

  function abrirEdicion(id: string) {
    setEditando(id);
    setBorrador(items[id] ?? []);
  }

  function toggleForma(forma: FormaPagoCompra) {
    setBorrador((prev) =>
      prev.some((i) => i.forma === forma)
        ? prev.filter((i) => i.forma !== forma)
        : [...prev, { forma, monto: null, plazo_dias: null }]
    );
  }

  // Solo dígitos: vacío queda en null para poder borrar el campo.
  function soloEntero(texto: string): number | null {
    const limpio = texto.replace(/\D/g, "");
    return limpio === "" ? null : Number(limpio);
  }

  function setMonto(forma: FormaPagoCompra, texto: string) {
    const monto = soloEntero(texto);
    setBorrador((prev) =>
      prev.map((i) => (i.forma === forma ? { ...i, monto } : i))
    );
  }

  function setPlazo(forma: FormaPagoCompra, texto: string) {
    const plazo_dias = soloEntero(texto);
    setBorrador((prev) =>
      prev.map((i) => (i.forma === forma ? { ...i, plazo_dias } : i))
    );
  }

  function guardarEdicion(id: string) {
    const normalizados = normalizarItemsPago(borrador);
    const anterior = items[id] ?? [];
    setItems((prev) => ({ ...prev, [id]: normalizados }));
    setEditando(null);
    setGuardando(id);
    startGuardar(async () => {
      const res = await setFormasPagoCompra(id, normalizados);
      setGuardando(null);
      if (res?.error) {
        // Revierte para no dejar en pantalla algo que no quedó guardado.
        setItems((prev) => ({ ...prev, [id]: anterior }));
        alert(res.error);
      }
    });
  }

  const filtradas = useMemo(() => {
    const q = proveedor.trim().toLowerCase();
    return compras.filter((c) => {
      if (desde && (!c.fecha_emision || c.fecha_emision < desde)) return false;
      if (hasta && (!c.fecha_emision || c.fecha_emision > hasta)) return false;
      if (tipo && String(c.tipo_doc) !== tipo) return false;
      if (pago) {
        // Con varias formas por compra, filtrar es "incluye ésta": una compra
        // pagada con cheque + débito aparece al filtrar por cualquiera de las dos.
        const propias = items[c.id] ?? [];
        const actuales = formasDe(propias);
        let coincide: boolean;
        if (pago === SIN_ASIGNAR) coincide = actuales.length === 0;
        else if (pago === CON_DEUDA)
          coincide = (montoDeuda(propias, c.monto_total) ?? 0) > 0;
        else coincide = actuales.includes(pago as FormaPagoCompra);
        if (!coincide) return false;
      }
      if (q) {
        const hay = `${c.razon_social ?? ""} ${c.rut_proveedor}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [compras, desde, hasta, proveedor, tipo, pago, items]);

  const totNeto = filtradas.reduce((s, c) => s + c.monto_neto, 0);
  const totIva = filtradas.reduce((s, c) => s + c.monto_iva, 0);
  const totTotal = filtradas.reduce((s, c) => s + c.monto_total, 0);
  // La deuda sale de un dato manual, así que puede estar incompleta: `pendientes`
  // son las compras sin formas cargadas, que no suman y hay que declarar.
  const deuda = totalDeuda(
    filtradas.map((c) => ({
      items: items[c.id] ?? [],
      montoTotal: c.monto_total,
    }))
  );
  const tipos = Array.from(new Set(compras.map((c) => c.tipo_doc))).sort((a, b) => a - b);

  const inputCls =
    "rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none";

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          Desde
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          Hasta
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          Proveedor / RUT
          <input
            type="text"
            value={proveedor}
            onChange={(e) => setProveedor(e.target.value)}
            placeholder="Buscar…"
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          Tipo
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={inputCls}>
            <option value="">Todos</option>
            {tipos.map((t) => (
              <option key={t} value={t}>{TIPO_DOC[t] ?? `Tipo ${t}`}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          Forma de pago
          <select value={pago} onChange={(e) => setPago(e.target.value)} className={inputCls}>
            <option value="">Todas</option>
            {FORMAS_PAGO_COMPRA.map((f) => (
              <option key={f} value={f}>{FORMA_PAGO_COMPRA_LABEL[f]}</option>
            ))}
            <option value={CON_DEUDA}>Con deuda</option>
            <option value={SIN_ASIGNAR}>Sin asignar</option>
          </select>
        </label>
        {(desde || hasta || proveedor || tipo || pago) && (
          <button
            type="button"
            onClick={() => { setDesde(""); setHasta(""); setProveedor(""); setTipo(""); setPago(""); }}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            Limpiar
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Proveedor</th>
              <th className="px-4 py-3">Documento</th>
              <th className="px-4 py-3">Folio</th>
              <th className="px-4 py-3 text-right">Neto</th>
              <th className="px-4 py-3 text-right">IVA</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3">Forma de pago</th>
              <th className="px-4 py-3 text-right">Por pagar</th>
              <th className="px-4 py-3 text-center">PDF</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtradas.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-slate-500">
                  No hay compras que coincidan con los filtros.
                </td>
              </tr>
            ) : (
              filtradas.map((c) => (
                <tr key={c.id} className="text-slate-700">
                  <td className="px-4 py-3 whitespace-nowrap">{formatFecha(c.fecha_emision)}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{c.razon_social ?? "—"}</div>
                    <div className="text-xs text-slate-500">{c.rut_proveedor}</div>
                  </td>
                  <td className="px-4 py-3">{TIPO_DOC[c.tipo_doc] ?? `Tipo ${c.tipo_doc}`}</td>
                  <td className="px-4 py-3">{c.folio}</td>
                  <td className="px-4 py-3 text-right">{formatCLP(c.monto_neto)}</td>
                  <td className="px-4 py-3 text-right">{formatCLP(c.monto_iva)}</td>
                  <td className="px-4 py-3 text-right font-medium text-slate-900">{formatCLP(c.monto_total)}</td>
                  <td className="px-4 py-3 align-top">
                    {editando === c.id ? (
                      (() => {
                        // Los montos solo tienen sentido con más de una forma: con
                        // una sola, el monto es el total del documento.
                        const varias = borrador.length > 1;
                        const suma = sumaMontos(borrador);
                        const falta = c.monto_total - suma;
                        return (
                          <div className="min-w-56 rounded-md border border-brand-300 bg-white p-2">
                            {FORMAS_PAGO_COMPRA.map((f) => {
                              const item = borrador.find((i) => i.forma === f);
                              return (
                                <div key={f} className="py-0.5">
                                  <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                                    <input
                                      type="checkbox"
                                      checked={item !== undefined}
                                      onChange={() => toggleForma(f)}
                                      className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                                    />
                                    {FORMA_PAGO_COMPRA_LABEL[f]}
                                  </label>
                                  {item !== undefined && (varias || admitePlazo(f)) && (
                                    <div className="mt-1 ml-6 flex flex-wrap items-center gap-1">
                                      {varias && (
                                        <input
                                          type="text"
                                          inputMode="numeric"
                                          value={item.monto ?? ""}
                                          placeholder="Monto"
                                          aria-label={`Monto pagado con ${FORMA_PAGO_COMPRA_LABEL[f]}`}
                                          onChange={(e) => setMonto(f, e.target.value)}
                                          className="w-24 rounded border border-slate-300 px-2 py-1 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                                        />
                                      )}
                                      {admitePlazo(f) && (
                                        <>
                                          <input
                                            type="text"
                                            inputMode="numeric"
                                            value={item.plazo_dias ?? ""}
                                            placeholder="Días"
                                            aria-label={`Plazo en días de ${FORMA_PAGO_COMPRA_LABEL[f]}`}
                                            onChange={(e) => setPlazo(f, e.target.value)}
                                            className="w-16 rounded border border-slate-300 px-2 py-1 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                                          />
                                          <span className="text-xs text-slate-500">
                                            {vencimientoDesde(c.fecha_emision, item.plazo_dias)
                                              ? `vence ${vencimientoDesde(c.fecha_emision, item.plazo_dias)}`
                                              : "días"}
                                          </span>
                                        </>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}

                            {varias && (
                              <div className="mt-2 border-t border-slate-200 pt-2 text-xs">
                                <div className="flex justify-between text-slate-500">
                                  <span>Suma</span>
                                  <span className="font-medium text-slate-700">
                                    {formatCLP(suma)}
                                  </span>
                                </div>
                                <div className="flex justify-between text-slate-500">
                                  <span>Total documento</span>
                                  <span>{formatCLP(c.monto_total)}</span>
                                </div>
                                {falta !== 0 && (
                                  <p className="mt-1 text-amber-600">
                                    {falta > 0
                                      ? `Faltan ${formatCLP(falta)} por asignar`
                                      : `Se pasa ${formatCLP(-falta)} del total`}
                                  </p>
                                )}
                              </div>
                            )}

                            <div className="mt-2 flex gap-1">
                              <button
                                type="button"
                                onClick={() => guardarEdicion(c.id)}
                                className="flex-1 rounded bg-brand-600 px-2 py-1 text-xs font-semibold text-white hover:bg-brand-700"
                              >
                                Guardar
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditando(null)}
                                className="rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        );
                      })()
                    ) : (
                      <button
                        type="button"
                        onClick={() => abrirEdicion(c.id)}
                        disabled={guardando === c.id}
                        title="Editar formas de pago (podés marcar varias e indicar el monto de cada una)"
                        className={`min-w-32 rounded-md border px-2 py-1.5 text-left text-sm hover:bg-slate-50 disabled:opacity-50 ${
                          (items[c.id] ?? []).length > 0
                            ? "border-slate-300 text-slate-900"
                            : "border-slate-200 bg-slate-50 text-slate-400"
                        }`}
                      >
                        {(items[c.id] ?? []).length > 0
                          ? etiquetaItemsPago(items[c.id])
                          : "— Sin asignar"}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right align-top">
                    {(() => {
                      const propias = items[c.id] ?? [];
                      const porPagar = montoDeuda(propias, c.monto_total);
                      if (porPagar === null) {
                        return (
                          <span
                            className="text-slate-400"
                            title="Falta cargar la forma de pago para saber si se debe"
                          >
                            —
                          </span>
                        );
                      }
                      // Con dos o más montos sin escribir el reparto es ambiguo
                      // y la deuda puede quedar corta: se avisa en la fila.
                      const ambiguo =
                        propias.filter((i) => i.monto === null).length > 1;
                      return (
                        <>
                          <span
                            className={
                              porPagar > 0
                                ? "font-semibold text-amber-700"
                                : "text-slate-400"
                            }
                          >
                            {formatCLP(porPagar)}
                          </span>
                          {ambiguo && (
                            <div
                              className="text-xs text-amber-600"
                              title="Hay más de una forma sin monto: no se puede repartir el total"
                            >
                              falta asignar
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <a
                      href={`/compras/${c.id}/pdf`}
                      target="_blank"
                      rel="noopener"
                      className="font-medium text-brand-600 hover:text-brand-800"
                    >
                      Ver
                    </a>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {filtradas.length > 0 && (
            <tfoot className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-900">
              <tr>
                <td className="px-4 py-3" colSpan={4}>
                  {filtradas.length} compra{filtradas.length === 1 ? "" : "s"}
                </td>
                <td className="px-4 py-3 text-right">{formatCLP(totNeto)}</td>
                <td className="px-4 py-3 text-right">{formatCLP(totIva)}</td>
                <td className="px-4 py-3 text-right">{formatCLP(totTotal)}</td>
                <td className="px-4 py-3" />
                <td className="px-4 py-3 text-right">
                  <span className={deuda.total > 0 ? "text-amber-700" : ""}>
                    {formatCLP(deuda.total)}
                  </span>
                  {deuda.pendientes > 0 && (
                    <div className="text-xs font-normal text-slate-500">
                      sin {deuda.pendientes} compra
                      {deuda.pendientes === 1 ? "" : "s"} por cargar
                    </div>
                  )}
                </td>
                <td className="px-4 py-3" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
