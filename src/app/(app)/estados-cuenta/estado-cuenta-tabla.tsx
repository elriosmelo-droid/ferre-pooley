"use client";

import { useMemo, useState } from "react";
import { formatCLP } from "@/lib/money";
import { TIPO_DOC_CORTO } from "@/lib/dte-doc";
import { totalesDeFilas, type FilaEstadoCuenta } from "@/lib/estado-cuenta";
import { EstadoPagoBadge } from "./estado-pago-badge";
import { VencimientoEditable } from "./vencimiento-editable";

function fmtFecha(iso: string | null) {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}-${m}-${a}`;
}

const inputCls =
  "rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none";

export function EstadoCuentaTabla({ filas }: { filas: FilaEstadoCuenta[] }) {
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [estado, setEstado] = useState("");
  const [tipoPago, setTipoPago] = useState("");
  const [tipoDoc, setTipoDoc] = useState("");

  // Tipos de documento presentes, para el selector.
  const tiposDoc = useMemo(
    () => Array.from(new Set(filas.map((f) => f.tipoDoc))).sort((a, b) => a - b),
    [filas]
  );

  const filtradas = useMemo(() => {
    return filas.filter((f) => {
      const fecha = f.fecha?.slice(0, 10) ?? "";
      if (desde && (!fecha || fecha < desde)) return false;
      if (hasta && (!fecha || fecha > hasta)) return false;
      if (tipoDoc && String(f.tipoDoc) !== tipoDoc) return false;
      if (tipoPago && f.tipoPago !== tipoPago) return false;
      if (estado) {
        if (estado === "credito") {
          if (!f.esCredito) return false;
        } else if (estado === "vencida") {
          if (f.estadoPago !== "pendiente" || !f.vencida) return false;
        } else if (estado === "pendiente") {
          if (f.estadoPago !== "pendiente" || f.vencida) return false;
        } else if (f.estadoPago !== estado) {
          return false;
        }
      }
      return true;
    });
  }, [filas, desde, hasta, estado, tipoPago, tipoDoc]);

  const totales = totalesDeFilas(filtradas);
  const saldoAFavor = totales.saldo < 0;
  const hayFiltro = desde || hasta || estado || tipoPago || tipoDoc;

  return (
    <div>
      {/* Filtros */}
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
          Documento
          <select value={tipoDoc} onChange={(e) => setTipoDoc(e.target.value)} className={inputCls}>
            <option value="">Todos</option>
            {tiposDoc.map((t) => (
              <option key={t} value={t}>
                {TIPO_DOC_CORTO[t] ?? `Tipo ${t}`}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          Tipo de pago
          <select value={tipoPago} onChange={(e) => setTipoPago(e.target.value)} className={inputCls}>
            <option value="">Todos</option>
            <option value="Contado">Contado</option>
            <option value="Crédito">Crédito</option>
            <option value="Canje">Canje</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          Estado
          <select value={estado} onChange={(e) => setEstado(e.target.value)} className={inputCls}>
            <option value="">Todos</option>
            <option value="pendiente">Pendiente</option>
            <option value="vencida">Vencida</option>
            <option value="pagada">Pagada</option>
            <option value="anulada">Anulada</option>
            <option value="credito">Nota de crédito</option>
          </select>
        </label>
        {hayFiltro && (
          <button
            type="button"
            onClick={() => {
              setDesde("");
              setHasta("");
              setEstado("");
              setTipoPago("");
              setTipoDoc("");
            }}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            Limpiar
          </button>
        )}
      </div>

      {/* Totales */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tarjeta titulo="Facturado" valor={formatCLP(totales.facturado)} />
        <Tarjeta titulo="Notas de crédito" valor={`− ${formatCLP(totales.creditos)}`} />
        <Tarjeta titulo="Pagado" valor={`− ${formatCLP(totales.pagado)}`} />
        <Tarjeta
          titulo={saldoAFavor ? "Saldo a favor" : "Saldo pendiente"}
          valor={formatCLP(Math.abs(totales.saldo))}
          destacado
          verde={saldoAFavor || totales.saldo === 0}
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Folio</th>
              <th className="px-4 py-3 text-right">Monto</th>
              <th className="px-4 py-3">Tipo de pago</th>
              <th className="px-4 py-3">Plazo</th>
              <th className="px-4 py-3">Vencimiento</th>
              <th className="px-4 py-3">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtradas.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                  No hay documentos que coincidan con los filtros.
                </td>
              </tr>
            ) : (
              filtradas.map((f) => (
                <tr key={f.id} className={f.vencida ? "bg-red-50 text-slate-700" : "text-slate-700"}>
                  <td className="px-4 py-3">{fmtFecha(f.fecha)}</td>
                  <td className="px-4 py-3">{f.tipoLabel}</td>
                  <td className="px-4 py-3">{f.folio}</td>
                  <td
                    className={`px-4 py-3 text-right font-medium ${
                      f.esCredito ? "text-red-600" : "text-slate-900"
                    }`}
                  >
                    {f.esCredito ? "− " : ""}
                    {formatCLP(f.monto)}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{f.tipoPago}</td>
                  <td className="px-4 py-3 text-slate-500">{f.plazoLabel}</td>
                  <td className="px-4 py-3">
                    {f.esCredito ? (
                      "—"
                    ) : (
                      <VencimientoEditable
                        ventaId={f.id}
                        vencimiento={f.vencimiento}
                        manual={f.vencimientoManual}
                        vencida={f.vencida}
                      />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <EstadoPagoBadge estado={f.estadoPago} vencida={f.vencida} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Tarjeta({
  titulo,
  valor,
  destacado,
  verde,
}: {
  titulo: string;
  valor: string;
  destacado?: boolean;
  verde?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        destacado
          ? verde
            ? "border-green-200 bg-green-50"
            : "border-amber-200 bg-amber-50"
          : "border-slate-200 bg-white"
      }`}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{titulo}</p>
      <p
        className={`mt-1 text-lg font-bold ${
          destacado ? (verde ? "text-green-700" : "text-amber-700") : "text-slate-900"
        }`}
      >
        {valor}
      </p>
    </div>
  );
}
