"use client";

import { useMemo, useState, useTransition } from "react";
import { formatCLP } from "@/lib/money";
import {
  FORMAS_PAGO_COMPRA,
  FORMA_PAGO_COMPRA_LABEL,
  etiquetaFormasPago,
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
  // Dato manual y opcional; una compra puede tener varias formas de pago.
  // null o vacío = sin asignar.
  forma_pago: string[] | null;
};

// "Sin asignar" es un filtro útil por sí mismo: son las compras que faltan
// completar. Se distingue de "Todas" con un valor centinela.
const SIN_ASIGNAR = "__sin__";

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
  const [formas, setFormas] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(compras.map((c) => [c.id, c.forma_pago ?? []]))
  );
  const [guardando, setGuardando] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [, startGuardar] = useTransition();

  // Marca o desmarca una forma en una compra y guarda de inmediato.
  function toggleFormaPago(id: string, forma: string) {
    const anterior = formas[id] ?? [];
    const siguiente = anterior.includes(forma)
      ? anterior.filter((f) => f !== forma)
      : [...anterior, forma];
    // Optimista: la casilla responde al instante y se revierte si el server falla.
    setFormas((prev) => ({ ...prev, [id]: siguiente }));
    setGuardando(id);
    startGuardar(async () => {
      const res = await setFormasPagoCompra(id, siguiente);
      setGuardando(null);
      if (res?.error) {
        setFormas((prev) => ({ ...prev, [id]: anterior }));
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
        const actual = formas[c.id] ?? [];
        const coincide =
          pago === SIN_ASIGNAR ? actual.length === 0 : actual.includes(pago);
        if (!coincide) return false;
      }
      if (q) {
        const hay = `${c.razon_social ?? ""} ${c.rut_proveedor}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [compras, desde, hasta, proveedor, tipo, pago, formas]);

  const totNeto = filtradas.reduce((s, c) => s + c.monto_neto, 0);
  const totIva = filtradas.reduce((s, c) => s + c.monto_iva, 0);
  const totTotal = filtradas.reduce((s, c) => s + c.monto_total, 0);
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
              <th className="px-4 py-3 text-center">PDF</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtradas.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
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
                      <div className="min-w-40 rounded-md border border-brand-300 bg-white p-2">
                        {FORMAS_PAGO_COMPRA.map((f) => (
                          <label
                            key={f}
                            className="flex cursor-pointer items-center gap-2 py-0.5 text-sm text-slate-700"
                          >
                            <input
                              type="checkbox"
                              checked={(formas[c.id] ?? []).includes(f)}
                              disabled={guardando === c.id}
                              onChange={() => toggleFormaPago(c.id, f)}
                              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                            />
                            {FORMA_PAGO_COMPRA_LABEL[f]}
                          </label>
                        ))}
                        <button
                          type="button"
                          onClick={() => setEditando(null)}
                          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                        >
                          Listo
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setEditando(c.id)}
                        title="Editar formas de pago (podés marcar varias)"
                        className={`min-w-32 rounded-md border px-2 py-1.5 text-left text-sm hover:bg-slate-50 ${
                          (formas[c.id] ?? []).length > 0
                            ? "border-slate-300 text-slate-900"
                            : "border-slate-200 bg-slate-50 text-slate-400"
                        }`}
                      >
                        {(formas[c.id] ?? []).length > 0
                          ? etiquetaFormasPago(formas[c.id])
                          : "— Sin asignar"}
                      </button>
                    )}
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
                <td className="px-4 py-3" colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
