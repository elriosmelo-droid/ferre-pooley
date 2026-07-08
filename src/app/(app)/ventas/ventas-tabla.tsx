"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatCLP } from "@/lib/money";
import { TIPO_DOC, esNotaCredito, signoDte } from "@/lib/dte-doc";
import { tipoPagoLabel, plazoDias, vencimientoEfectivo } from "@/lib/estado-cuenta";

export type VentaRow = {
  id: string;
  tipo_doc: number;
  rut_cliente: string;
  razon_social: string | null;
  folio: string;
  fecha_emision: string | null;
  monto_total: number;
  forma_pago: number | null;
  term_pago_dias: number | null;
  fecha_vencimiento: string | null;
  fecha_vencimiento_manual: string | null;
  notas_venta: { id: string; folio: string } | null;
};

function formatFecha(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}


export function VentasTabla({ ventas }: { ventas: VentaRow[] }) {
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [cliente, setCliente] = useState("");
  const [tipo, setTipo] = useState("");

  const filtradas = useMemo(() => {
    const q = cliente.trim().toLowerCase();
    return ventas.filter((v) => {
      if (desde && (!v.fecha_emision || v.fecha_emision < desde)) return false;
      if (hasta && (!v.fecha_emision || v.fecha_emision > hasta)) return false;
      if (tipo && String(v.tipo_doc) !== tipo) return false;
      if (q) {
        const hay = `${v.razon_social ?? ""} ${v.rut_cliente}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [ventas, desde, hasta, cliente, tipo]);

  // Total neto: facturas suman, notas de crédito restan.
  const total = filtradas.reduce(
    (sum, v) => sum + signoDte(v.tipo_doc) * v.monto_total,
    0
  );
  const tipos = Array.from(new Set(ventas.map((v) => v.tipo_doc))).sort((a, b) => a - b);

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
          Cliente / RUT
          <input
            type="text"
            value={cliente}
            onChange={(e) => setCliente(e.target.value)}
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
        {(desde || hasta || cliente || tipo) && (
          <button
            type="button"
            onClick={() => { setDesde(""); setHasta(""); setCliente(""); setTipo(""); }}
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
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Documento</th>
              <th className="px-4 py-3">Folio SII</th>
              <th className="px-4 py-3">Tipo de pago</th>
              <th className="px-4 py-3">Plazo</th>
              <th className="px-4 py-3">Vencimiento</th>
              <th className="px-4 py-3">Nota de venta</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3 text-center">PDF</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtradas.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-slate-500">
                  No hay ventas que coincidan con los filtros.
                </td>
              </tr>
            ) : (
              filtradas.map((v) => (
                <tr key={v.id} className="text-slate-700">
                  <td className="px-4 py-3 whitespace-nowrap">{formatFecha(v.fecha_emision)}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{v.razon_social ?? "—"}</div>
                    <div className="text-xs text-slate-500">{v.rut_cliente}</div>
                  </td>
                  <td className="px-4 py-3">{TIPO_DOC[v.tipo_doc] ?? `Tipo ${v.tipo_doc}`}</td>
                  <td className="px-4 py-3">{v.folio}</td>
                  <td className="px-4 py-3">
                    {esNotaCredito(v.tipo_doc) ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      tipoPagoLabel(v.forma_pago)
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {esNotaCredito(v.tipo_doc)
                      ? "—"
                      : `${plazoDias(v.forma_pago, v.term_pago_dias)} días`}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {esNotaCredito(v.tipo_doc) ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      formatFecha(
                        vencimientoEfectivo(
                          v.fecha_vencimiento_manual,
                          v.fecha_emision,
                          v.forma_pago,
                          v.term_pago_dias
                        )
                      )
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {v.notas_venta ? (
                      <Link href={`/notas-venta/${v.notas_venta.id}`} className="font-medium text-brand-600 hover:text-brand-800">
                        {v.notas_venta.folio}
                      </Link>
                    ) : (
                      <span className="text-slate-400">Sin vincular</span>
                    )}
                  </td>
                  <td className={`px-4 py-3 text-right font-medium ${esNotaCredito(v.tipo_doc) ? "text-amber-700" : "text-slate-900"}`}>
                    {esNotaCredito(v.tipo_doc) ? "-" : ""}
                    {formatCLP(v.monto_total)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <a
                      href={`/ventas/${v.id}/pdf`}
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
                <td className="px-4 py-3" colSpan={8}>
                  {filtradas.length} venta{filtradas.length === 1 ? "" : "s"}
                </td>
                <td className="px-4 py-3 text-right">{formatCLP(total)}</td>
                <td className="px-4 py-3" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
