"use client";

import { useMemo, useState, useTransition } from "react";
import { formatCLP } from "@/lib/money";
import {
  FORMAS_PAGO_COMPRA,
  FORMA_PAGO_COMPRA_LABEL,
} from "@/lib/forma-pago-compra";
import { setFormaPagoCompra } from "./actions";

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
  // Dato manual y opcional: null = sin asignar.
  forma_pago: string | null;
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
  // La forma de pago vive en el estado del padre, no en cada select: si no, al
  // cambiarla el filtro seguiría viendo el valor viejo.
  const [formas, setFormas] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(compras.map((c) => [c.id, c.forma_pago]))
  );
  const [guardando, setGuardando] = useState<string | null>(null);
  const [, startGuardar] = useTransition();

  function cambiarFormaPago(id: string, valor: string) {
    const anterior = formas[id] ?? null;
    // Optimista: el select responde al instante y se revierte si el server falla.
    setFormas((prev) => ({ ...prev, [id]: valor === "" ? null : valor }));
    setGuardando(id);
    startGuardar(async () => {
      const res = await setFormaPagoCompra(id, valor);
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
        const actual = formas[c.id] ?? null;
        if (pago === SIN_ASIGNAR ? actual !== null : actual !== pago) return false;
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
                  <td className="px-4 py-3">
                    <select
                      value={formas[c.id] ?? ""}
                      disabled={guardando === c.id}
                      aria-label={`Forma de pago de la compra ${c.folio}`}
                      onChange={(e) => cambiarFormaPago(c.id, e.target.value)}
                      className={`w-full min-w-32 rounded-md border px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50 ${
                        formas[c.id]
                          ? "border-slate-300 text-slate-900"
                          : "border-slate-200 bg-slate-50 text-slate-400"
                      }`}
                    >
                      <option value="">— Sin asignar</option>
                      {FORMAS_PAGO_COMPRA.map((f) => (
                        <option key={f} value={f}>{FORMA_PAGO_COMPRA_LABEL[f]}</option>
                      ))}
                    </select>
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
