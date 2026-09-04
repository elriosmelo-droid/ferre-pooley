"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatCLP } from "@/lib/money";
import { formatPct } from "@/lib/totals";
import {
  cobrado,
  resumenPorVenta,
  resumenPorCaja,
  abonosEnRango,
  utilidadPercibida,
  estaVencida,
  pctUtilidad,
  type NotaCobrable,
} from "@/lib/cobros";
import { hoyChile } from "@/lib/fecha";

export type NotaFinanzas = NotaCobrable & {
  folio: string;
  cliente: string;
  netoDoc: number;
};

// Un saldo separado en su parte neta y su IVA.
export type Desglose = { bruto: number; neto: number; iva: number };

// Card de un monto con su desglose de IVA debajo. El IVA de una cuenta por
// cobrar no es plata de la empresa (se entera al fisco) y el de una por pagar
// se recupera como crédito: verlos juntos infla lo que uno cree que tiene.
function CardIva({
  label,
  d,
  detalle,
  aviso,
  tono,
}: {
  label: string;
  d: Desglose;
  detalle: string;
  aviso?: string;
  tono: "cobrar" | "pagar";
}) {
  return (
    <div className="rounded-xl bg-slate-50 p-5">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p
        className={`mt-2 text-2xl font-bold tracking-tight sm:text-3xl ${
          tono === "pagar" ? "text-red-700" : "text-slate-900"
        }`}
      >
        {formatCLP(d.bruto)}
      </p>
      <dl className="mt-2 space-y-0.5 text-xs text-slate-600">
        <div className="flex justify-between">
          <dt>Neto</dt>
          <dd className="font-medium">{formatCLP(d.neto)}</dd>
        </div>
        <div className="flex justify-between text-slate-400">
          <dt>IVA</dt>
          <dd>{formatCLP(d.iva)}</dd>
        </div>
      </dl>
      <p className="mt-1.5 text-xs text-slate-500">{detalle}</p>
      {aviso && <p className="mt-1 text-xs text-amber-700">{aviso}</p>}
    </div>
  );
}

const LENTES = [
  {
    id: "venta",
    label: "Por venta",
    ayuda: "De lo vendido en el período, cuánto se ha cobrado hasta hoy.",
  },
  {
    id: "caja",
    label: "Por caja",
    ayuda:
      "Cuánta plata entró en el período y qué utilidad traía, sin importar cuándo se vendió.",
  },
] as const;

function formatFecha(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function Kpi({
  label,
  value,
  detail,
  alerta,
}: {
  label: string;
  value: string;
  detail: string;
  alerta?: boolean;
}) {
  return (
    <div className="rounded-xl bg-slate-50 p-5">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p
        className={`mt-2 text-2xl font-bold tracking-tight sm:text-3xl ${
          alerta ? "text-amber-700" : "text-slate-900"
        }`}
      >
        {value}
      </p>
      <p className="mt-1.5 text-xs text-slate-500">{detail}</p>
    </div>
  );
}

export function FinanzasVista({
  notas,
  sinNota,
  porCobrar,
  porPagar,
  pagarPendiente,
}: {
  notas: NotaFinanzas[];
  sinNota: { cantidad: number; monto: number };
  porCobrar: Desglose;
  porPagar: Desglose;
  pagarPendiente: { cantidad: number; monto: number };
}) {
  const hoy = hoyChile();
  const [lente, setLente] = useState<string>("venta");
  const [desde, setDesde] = useState(() => `${hoy.slice(0, 7)}-01`);
  const [hasta, setHasta] = useState(hoy);
  const [busqueda, setBusqueda] = useState("");

  const porVenta = lente === "venta";

  const datos = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const coincide = (n: NotaFinanzas) =>
      !q || `${n.folio} ${n.cliente}`.toLowerCase().includes(q);

    // La lente por venta filtra por fecha de la nota; la de caja no filtra las
    // notas, filtra los abonos (una nota de mayo puede cobrarse en junio).
    // Las anuladas quedan fuera de toda la página: no suman a ningún KPI, así
    // que tampoco se pintan en la tabla (antes salían en ámbar con opacidad,
    // como si fueran plata por cobrar).
    const visibles = notas.filter(
      (n) =>
        !n.anulada &&
        coincide(n) &&
        (!porVenta ||
          ((!desde || n.fechaVenta >= desde) &&
            (!hasta || n.fechaVenta <= hasta)))
    );

    return {
      visibles,
      venta: resumenPorVenta(visibles, hoy),
      caja: resumenPorCaja(visibles, desde, hasta),
      abonos: abonosEnRango(visibles, desde, hasta).sort((a, b) =>
        b.cobro.fecha.localeCompare(a.cobro.fecha)
      ),
    };
  }, [notas, desde, hasta, busqueda, porVenta, hoy]);

  const inputCls =
    "rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none";

  const r = datos.venta;
  const kpis = porVenta
    ? [
        {
          label: "Vendido",
          value: formatCLP(r.vendido),
          detail: `${r.notas} nota${r.notas === 1 ? "" : "s"} · bruto, con IVA`,
        },
        {
          label: "Utilidad generada",
          // pctUtilidad usa `venta` (neta, sin flete) y no `vendido` (bruto,
          // con IVA y flete): son bases distintas y dividir utilidad (neta)
          // por vendido (bruto) da un porcentaje que no significa nada. Es
          // la misma base que usa /notas-venta.
          value: `${formatCLP(r.utilidad)} (${formatPct(pctUtilidad(r))})`,
          detail: "Neta, sin flete",
        },
        {
          label: "Cobrado a hoy",
          value: `${formatCLP(r.cobrado)} (${formatPct(
            r.vendido > 0 ? (r.cobrado / r.vendido) * 100 : 0
          )})`,
          detail: "Abonos recibidos, en cualquier fecha",
        },
        {
          label: "Utilidad percibida",
          value: formatCLP(r.utilidadPercibida),
          detail: "Proporcional a lo cobrado de cada nota",
        },
        {
          label: "Por cobrar",
          value: formatCLP(r.porCobrar),
          detail: `${formatCLP(r.porCobrarVencido)} vencido`,
          alerta: r.porCobrarVencido > 0,
        },
      ]
    : [
        {
          label: "Entró a caja",
          value: formatCLP(datos.caja.cobrado),
          detail: `${datos.caja.abonos} abono${
            datos.caja.abonos === 1 ? "" : "s"
          } en el período`,
        },
        {
          label: "Utilidad percibida",
          value: formatCLP(datos.caja.utilidadPercibida),
          detail: "La parte del margen que traía cada abono",
        },
        {
          // r sale de resumenPorVenta(visibles, hoy): en esta lente
          // `visibles` no se filtra por fecha (el rango de la lente por caja
          // filtra los abonos, no las notas), pero sí respeta la búsqueda.
          // El número NO es "todas las notas" si hay texto en el buscador.
          label: "Por cobrar",
          value: formatCLP(r.porCobrar),
          detail: `${formatCLP(
            r.porCobrarVencido
          )} vencido · no se filtra por fecha`,
          alerta: r.porCobrarVencido > 0,
        },
      ];

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900">Situación</h2>
        <p className="mt-1 text-sm text-slate-500">
          Las dos primeras son del período filtrado. Las cuentas por cobrar y
          por pagar son el saldo a hoy: no se filtran por fecha.
        </p>
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl bg-slate-50 p-5">
            <p className="text-sm font-medium text-slate-500">
              Utilidad percibida
            </p>
            <p className="mt-2 text-2xl font-bold tracking-tight text-green-700 sm:text-3xl">
              {formatCLP(datos.venta.utilidadPercibida)}
            </p>
            <p className="mt-1.5 text-xs text-slate-500">
              Ya está en caja · neta, sin flete
            </p>
          </div>

          <div className="rounded-xl bg-slate-50 p-5">
            <p className="text-sm font-medium text-slate-500">
              Utilidad por percibir
            </p>
            <p className="mt-2 text-2xl font-bold tracking-tight text-amber-700 sm:text-3xl">
              {formatCLP(
                datos.venta.utilidad - datos.venta.utilidadPercibida
              )}
            </p>
            <p className="mt-1.5 text-xs text-slate-500">
              Falta cobrarla · de {formatCLP(datos.venta.utilidad)} generados
            </p>
          </div>

          <CardIva
            label="Cuentas por cobrar"
            d={porCobrar}
            detalle="Saldo de las notas activas, a hoy"
            tono="cobrar"
          />

          <CardIva
            label="Cuentas por pagar"
            d={porPagar}
            detalle="Compras a crédito y cheque, a hoy"
            tono="pagar"
            aviso={
              pagarPendiente.cantidad > 0
                ? `${pagarPendiente.cantidad} compras por ${formatCLP(pagarPendiente.monto)} sin forma de pago cargada: no suman acá`
                : undefined
            }
          />
        </div>
        <p className="mt-4 text-xs text-slate-400">
          El IVA no es utilidad: en lo que te deben lo cobras para enterarlo al
          fisco, y en lo que debes lo recuperas como crédito. La utilidad ya
          está neta, por eso no lleva desglose.
        </p>
      </section>

      {sinNota.cantidad > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
          <strong>{sinNota.cantidad} facturas</strong> por{" "}
          {formatCLP(sinNota.monto)} no tienen nota de venta vinculada, así que
          no tienen costo conocido y quedan fuera de estos números.{" "}
          <Link href="/conciliacion" className="font-semibold underline">
            Vincularlas en Conciliación
          </Link>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex flex-wrap items-end gap-3">
          <div className="flex gap-1">
            {LENTES.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => setLente(l.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  lente === l.id
                    ? "bg-brand-600 text-white"
                    : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
          <label className="flex flex-col gap-1 text-xs text-slate-500">
            Desde
            <input
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              className={inputCls}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-500">
            Hasta
            <input
              type="date"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
              className={inputCls}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-500">
            Buscar
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Folio o cliente…"
              className={inputCls}
            />
          </label>
        </div>

        <p className="mb-4 text-xs text-slate-500">
          {LENTES.find((l) => l.id === lente)?.ayuda}
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {kpis.map((k) => (
            <Kpi key={k.label} {...k} />
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        {porVenta ? (
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Folio</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-right">Cobrado</th>
                <th className="px-4 py-3 text-right">Saldo</th>
                <th className="px-4 py-3">Vence</th>
                <th className="px-4 py-3 text-right">Margen</th>
                <th className="px-4 py-3 text-right">Percibido</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {datos.visibles.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                    No hay notas de venta en el período.
                  </td>
                </tr>
              ) : (
                datos.visibles.map((n) => {
                  const pagado = cobrado(n.cobros);
                  const pendiente = n.total - pagado;
                  const vencida = estaVencida(n, hoy);
                  return (
                    <tr key={n.id} className="text-slate-700">
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {n.folio}
                      </td>
                      <td className="px-4 py-3">{n.cliente}</td>
                      <td className="px-4 py-3">{formatFecha(n.fechaVenta)}</td>
                      <td className="px-4 py-3 text-right">
                        {formatCLP(n.total)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {formatCLP(pagado)}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-medium ${
                          pendiente > 0 ? "text-amber-700" : "text-slate-400"
                        }`}
                      >
                        {pendiente === 0 ? "—" : formatCLP(pendiente)}
                      </td>
                      <td
                        className={`px-4 py-3 ${
                          vencida ? "font-medium text-red-600" : ""
                        }`}
                      >
                        {formatFecha(n.vencimiento)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {formatCLP(n.margen)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-slate-900">
                        {formatCLP(utilidadPercibida(n))}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        ) : (
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Fecha del pago</th>
                <th className="px-4 py-3">Folio</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3 text-right">Monto</th>
                <th className="px-4 py-3 text-right">Utilidad</th>
                <th className="px-4 py-3">Observación</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {datos.abonos.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    No entró dinero en el período.
                  </td>
                </tr>
              ) : (
                datos.abonos.map((a) => (
                  <tr key={a.cobro.id} className="text-slate-700">
                    <td className="px-4 py-3">{formatFecha(a.cobro.fecha)}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {a.nota.folio}
                    </td>
                    <td className="px-4 py-3">{a.nota.cliente}</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-900">
                      {formatCLP(a.cobro.monto)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {formatCLP(a.utilidad)}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {a.cobro.observacion ?? "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
