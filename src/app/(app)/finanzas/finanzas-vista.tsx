"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatCLP } from "@/lib/money";
import { formatPct } from "@/lib/totals";
import {
  cobrado,
  saldo,
  parteNeta,
  resumenPorVenta,
  resumenPorCaja,
  abonosEnRango,
  utilidadPercibida,
  estaVencida,
  pctUtilidad,
  type NotaCobrable,
} from "@/lib/cobros";
import { hoyChile, ultimosMeses, diasEntre } from "@/lib/fecha";

export type NotaFinanzas = NotaCobrable & {
  folio: string;
  cliente: string;
  // Folios de las facturas del SII de esta nota. Puede venir vacío: una nota
  // recién creada todavía no se factura.
  facturas: string[];
};

// Un saldo separado en su parte neta y su IVA.
export type Desglose = { bruto: number; neto: number; iva: number };

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

// Card de un monto, con una nota al pie cuando hay algo que aclarar (el IVA
// que lleva incluido, o lo que quedó fuera del cálculo).
function CardMonto({
  label,
  monto,
  detalle,
  nota,
  aviso,
  tono,
}: {
  label: string;
  monto: number;
  detalle: string;
  nota?: string;
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
        {formatCLP(monto)}
      </p>
      <p className="mt-1.5 text-xs text-slate-500">{detalle}</p>
      {nota && <p className="mt-1 text-xs text-slate-400">{nota}</p>}
      {aviso && <p className="mt-1 text-xs text-amber-700">{aviso}</p>}
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

  // Con IVA / Sin IVA para TODA la página. El IVA no es de la empresa: se
  // cobra al cliente para enterarlo al fisco, y en las compras se recupera
  // como crédito. Verlo aparte cambia el tamaño de lo que uno cree que tiene.
  // La utilidad no cambia con el switch: ya se calcula sobre montos netos.
  const [conIva, setConIva] = useState(true);

  // Convierte un monto bruto a la base elegida, en proporción a su documento.
  const base = (
    monto: number,
    doc: { netoDoc: number; total: number }
  ): number => (conIva ? monto : parteNeta(monto, doc.netoDoc, doc.total));

  // La sección "Situación" tiene su propio período, independiente del de las
  // lentes de abajo: son dos preguntas distintas y compartir un filtro hacía
  // imposible saber qué mandaba sobre qué.
  const meses = useMemo(() => ultimosMeses(hoy, 3), [hoy]);
  const [desdeSit, setDesdeSit] = useState(() => `${hoy.slice(0, 7)}-01`);
  const [hastaSit, setHastaSit] = useState(hoy);
  const mesSit = meses.find(
    (m) => m.desde === desdeSit && m.hasta === hastaSit
  );

  function alternarMesSit(m: (typeof meses)[number]) {
    if (mesSit?.clave === m.clave) {
      setDesdeSit("");
      setHastaSit("");
    } else {
      setDesdeSit(m.desde);
      setHastaSit(m.hasta);
    }
  }

  // Notas del período elegido arriba, sin anuladas. Es la base de las tres
  // secciones de Situación: los totales y los dos detalles.
  const notasSit = useMemo(
    () =>
      notas.filter(
        (n) =>
          !n.anulada &&
          (!desdeSit || n.fechaVenta >= desdeSit) &&
          (!hastaSit || n.fechaVenta <= hastaSit)
      ),
    [notas, desdeSit, hastaSit]
  );

  // Detalle de lo percibido: una fila por nota con algo cobrado, ordenada por
  // lo que más utilidad trajo.
  const percibidas = useMemo(
    () =>
      notasSit
        .map((n) => {
          const cob = cobrado(n.cobros);
          return {
            n,
            cobrado: cob,
            utilidad: utilidadPercibida(n),
            // Último abono: es "cuándo se pagó" para quien mira la fila.
            ultimoPago: n.cobros
              .map((c) => c.fecha)
              .sort()
              .at(-1),
            pctCobrado: n.total > 0 ? (cob / n.total) * 100 : 0,
          };
        })
        .filter((f) => f.cobrado > 0)
        .sort((a, b) => b.utilidad - a.utilidad),
    [notasSit]
  );

  // Detalle de lo que falta cobrar, ordenado por vencimiento: lo que vence
  // antes va primero, y lo sin fecha al final.
  const porPercibir = useMemo(
    () =>
      notasSit
        .map((n) => {
          const saldoPend = saldo(n.total, n.cobros);
          return {
            n,
            saldo: saldoPend,
            // La utilidad que falta es la total menos la ya percibida.
            utilidad: n.margen - utilidadPercibida(n),
            dias: n.vencimiento ? diasEntre(hoy, n.vencimiento) : null,
          };
        })
        .filter((f) => f.saldo > 0)
        .sort((a, b) => {
          if (a.dias === null) return 1;
          if (b.dias === null) return -1;
          return a.dias - b.dias;
        }),
    [notasSit, hoy]
  );

  const totPercibidas = {
    utilidad: percibidas.reduce((s, f) => s + f.utilidad, 0),
    cobrado: percibidas.reduce((s, f) => s + base(f.cobrado, f.n), 0),
  };
  const totPorPercibir = {
    utilidad: porPercibir.reduce((s, f) => s + f.utilidad, 0),
    saldo: porPercibir.reduce((s, f) => s + base(f.saldo, f.n), 0),
    vencido: porPercibir
      .filter((f) => f.dias !== null && f.dias < 0)
      .reduce((s, f) => s + base(f.saldo, f.n), 0),
    sinFecha: porPercibir.filter((f) => f.dias === null).length,
  };

  // Utilidad del período elegido arriba. Las anuladas quedan fuera vía
  // resumenPorVenta.
  const situacion = useMemo(
    () =>
      resumenPorVenta(
        notas.filter(
          (n) =>
            (!desdeSit || n.fechaVenta >= desdeSit) &&
            (!hastaSit || n.fechaVenta <= hastaSit)
        ),
        hoy
      ),
    [notas, desdeSit, hastaSit, hoy]
  );

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
          value: formatCLP(conIva ? r.vendido : r.vendidoNeto),
          detail: `${r.notas} nota${r.notas === 1 ? "" : "s"} · ${
            conIva ? "bruto, con IVA" : "neto, sin IVA"
          }`,
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
          value: `${formatCLP(conIva ? r.cobrado : r.cobradoNeto)} (${formatPct(
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
          value: formatCLP(conIva ? r.porCobrar : r.porCobrarNeto),
          detail: `${formatCLP(
            conIva ? r.porCobrarVencido : r.porCobrarVencidoNeto
          )} vencido`,
          alerta: r.porCobrarVencido > 0,
        },
      ]
    : [
        {
          label: "Entró a caja",
          value: formatCLP(
            conIva ? datos.caja.cobrado : datos.caja.cobradoNeto
          ),
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
          value: formatCLP(conIva ? r.porCobrar : r.porCobrarNeto),
          detail: `${formatCLP(
            conIva ? r.porCobrarVencido : r.porCobrarVencidoNeto
          )} vencido · no se filtra por fecha`,
          alerta: r.porCobrarVencido > 0,
        },
      ];

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Situación</h2>
            <p className="mt-1 text-sm text-slate-500">
              Filtro propio, independiente de las lentes de más abajo.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex overflow-hidden rounded-lg border border-slate-300">
              {[
                { id: true, label: "Con IVA" },
                { id: false, label: "Sin IVA" },
              ].map((o) => (
                <button
                  key={String(o.id)}
                  type="button"
                  onClick={() => setConIva(o.id)}
                  aria-pressed={conIva === o.id}
                  title={
                    o.id
                      ? "Montos brutos, como se facturan y se cobran"
                      : "Montos netos: descuenta el IVA, que no es de la empresa"
                  }
                  className={`px-3 py-2 text-xs font-semibold transition-colors ${
                    conIva === o.id
                      ? "bg-slate-900 text-white"
                      : "bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            {meses.map((m) => {
              const activo = mesSit?.clave === m.clave;
              return (
                <button
                  key={m.clave}
                  type="button"
                  onClick={() => alternarMesSit(m)}
                  aria-pressed={activo}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    activo
                      ? "bg-brand-600 text-white"
                      : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {m.etiqueta}
                </button>
              );
            })}
            <label className="flex flex-col gap-1 text-xs text-slate-500">
              Desde
              <input
                type="date"
                value={desdeSit}
                onChange={(e) => setDesdeSit(e.target.value)}
                className={inputCls}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-500">
              Hasta
              <input
                type="date"
                value={hastaSit}
                onChange={(e) => setHastaSit(e.target.value)}
                className={inputCls}
              />
            </label>
            {(desdeSit || hastaSit) && (
              <button
                type="button"
                onClick={() => {
                  setDesdeSit("");
                  setHastaSit("");
                }}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                Todo
              </button>
            )}
          </div>
        </div>
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl bg-slate-50 p-5">
            <p className="text-sm font-medium text-slate-500">
              Utilidad percibida
            </p>
            <p className="mt-2 text-2xl font-bold tracking-tight text-green-700 sm:text-3xl">
              {formatCLP(situacion.utilidadPercibida)}
            </p>
            <p className="mt-1.5 text-xs text-slate-500">
              Ya está en caja · del período · neta, sin flete
            </p>
          </div>

          <div className="rounded-xl bg-slate-50 p-5">
            <p className="text-sm font-medium text-slate-500">
              Utilidad por percibir
            </p>
            <p className="mt-2 text-2xl font-bold tracking-tight text-amber-700 sm:text-3xl">
              {formatCLP(situacion.utilidad - situacion.utilidadPercibida)}
            </p>
            <p className="mt-1.5 text-xs text-slate-500">
              Falta cobrarla · de {formatCLP(situacion.utilidad)} generados
            </p>
          </div>

          <CardMonto
            label="Cuentas por cobrar"
            monto={conIva ? porCobrar.bruto : porCobrar.neto}
            detalle="Saldo total a hoy · NO sigue el filtro"
            nota={conIva ? `Incluye ${formatCLP(porCobrar.iva)} de IVA` : undefined}
            tono="cobrar"
          />

          <CardMonto
            label="Cuentas por pagar"
            monto={conIva ? porPagar.bruto : porPagar.neto}
            detalle="Deuda total a hoy · NO sigue el filtro"
            nota={
              conIva
                ? `Incluye ${formatCLP(porPagar.iva)} de IVA recuperable`
                : undefined
            }
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

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 px-6 py-5">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Utilidades percibidas
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Facturas del período cuya venta ya se cobró, total o en parte.
            </p>
          </div>
          <div className="flex gap-6 text-right">
            <div>
              <p className="text-xs text-slate-500">Cobrado</p>
              <p className="text-xl font-bold text-slate-900">
                {formatCLP(totPercibidas.cobrado)}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Utilidad percibida</p>
              <p className="text-xl font-bold text-green-700">
                {formatCLP(totPercibidas.utilidad)}
              </p>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Factura</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Último pago</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-right">Cobrado</th>
                <th className="px-4 py-3 text-right">Utilidad percibida</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {percibidas.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    No se ha cobrado nada de las ventas del período.
                  </td>
                </tr>
              ) : (
                percibidas.map((f) => (
                  <tr key={f.n.id} className="text-slate-700">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {f.n.facturas.length > 0 ? (
                        f.n.facturas.join(", ")
                      ) : (
                        <span
                          className="text-amber-700"
                          title="Esta nota todavía no tiene factura emitida"
                        >
                          sin factura
                        </span>
                      )}
                      <div className="text-xs font-normal text-slate-400">
                        {f.n.folio}
                      </div>
                    </td>
                    <td className="px-4 py-3">{f.n.cliente}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {formatFecha(f.ultimoPago ?? null)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {formatCLP(base(f.n.total, f.n))}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {formatCLP(base(f.cobrado, f.n))}
                      <div className="text-xs text-slate-400">
                        {formatPct(f.pctCobrado)} del total
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-green-700">
                      {formatCLP(f.utilidad)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 px-6 py-5">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Utilidades por percibir
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Lo que falta cobrar de las ventas del período, y cuándo debería
              entrar según el plazo de cada factura.
            </p>
          </div>
          <div className="flex gap-6 text-right">
            <div>
              <p className="text-xs text-slate-500">Por cobrar</p>
              <p className="text-xl font-bold text-slate-900">
                {formatCLP(totPorPercibir.saldo)}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Utilidad por percibir</p>
              <p className="text-xl font-bold text-amber-700">
                {formatCLP(totPorPercibir.utilidad)}
              </p>
            </div>
          </div>
        </div>
        {(totPorPercibir.vencido > 0 || totPorPercibir.sinFecha > 0) && (
          <div className="border-b border-slate-100 px-6 py-3 text-xs">
            {totPorPercibir.vencido > 0 && (
              <span className="mr-4 font-medium text-red-600">
                {formatCLP(totPorPercibir.vencido)} ya vencido
              </span>
            )}
            {totPorPercibir.sinFecha > 0 && (
              <span className="text-slate-500">
                {totPorPercibir.sinFecha} sin fecha: no tienen factura emitida,
                así que no hay plazo desde el cual contar
              </span>
            )}
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Factura</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Vence</th>
                <th className="px-4 py-3">Cuándo</th>
                <th className="px-4 py-3 text-right">Por cobrar</th>
                <th className="px-4 py-3 text-right">Utilidad por percibir</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {porPercibir.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    No queda nada por cobrar de las ventas del período.
                  </td>
                </tr>
              ) : (
                porPercibir.map((f) => (
                  <tr key={f.n.id} className="text-slate-700">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {f.n.facturas.length > 0 ? (
                        f.n.facturas.join(", ")
                      ) : (
                        <span className="text-amber-700">sin factura</span>
                      )}
                      <div className="text-xs font-normal text-slate-400">
                        {f.n.folio}
                      </div>
                    </td>
                    <td className="px-4 py-3">{f.n.cliente}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {formatFecha(f.n.vencimiento)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {f.dias === null ? (
                        <span className="text-slate-400">—</span>
                      ) : f.dias < 0 ? (
                        <span className="font-medium text-red-600">
                          vencida hace {Math.abs(f.dias)} d
                        </span>
                      ) : f.dias === 0 ? (
                        <span className="font-medium text-amber-700">hoy</span>
                      ) : (
                        <span className="text-slate-600">en {f.dias} d</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {formatCLP(base(f.saldo, f.n))}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-amber-700">
                      {formatCLP(f.utilidad)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
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
