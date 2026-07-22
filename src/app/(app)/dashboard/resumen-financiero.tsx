"use client";

import { useMemo, useState } from "react";
import { formatCLP } from "@/lib/money";
import { signoDte } from "@/lib/dte-doc";

// Colores de las series (validados: contraste, CVD y croma OK sobre blanco).
const COLOR_MARGEN = "#d80018";
const COLOR_COSTO = "#1d4ed8";

// Documento del SII reducido a lo que necesita el resumen. `neto` incluye lo
// exento; el signo por tipo (NC resta) se aplica al sumar.
export type DocSii = {
  fecha: string | null; // 'AAAA-MM-DD'
  tipo_doc: number;
  neto: number;
};

// Nota de venta conciliada (con factura SII vinculada), ya reducida.
export type NotaConciliada = {
  fecha: string; // 'AAAA-MM-DD' (creación, hora de Chile)
  venta: number; // neto sin flete
  costo: number;
};

const MESES_CORTOS = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

function etiquetaMes(clave: string): string {
  const [anio, mes] = clave.split("-").map(Number);
  return `${MESES_CORTOS[mes - 1]} ${String(anio).slice(2)}`;
}
function etiquetaDia(clave: string): string {
  const [, mes, dia] = clave.split("-");
  return `${dia}/${mes}`;
}

function hoyChile(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
  }).format(new Date());
}

function pct(margen: number, venta: number): string {
  if (venta === 0) return "—";
  return `${Math.round((margen / venta) * 100)}%`;
}

type MesAgg = {
  clave: string;
  ventas: number;
  compras: number;
  margenVenta: number; // venta conciliada
  margenCosto: number;
  notas: number;
};

const PRESETS = [
  { id: "mes", label: "Este mes" },
  { id: "mes-ant", label: "Mes anterior" },
] as const;

// Rango [desde, hasta] del mes anterior a partir de un 'AAAA-MM-DD'.
function rangoMesAnterior(hoy: string): [string, string] {
  const [a, m] = hoy.slice(0, 7).split("-").map(Number);
  let pa = a, pm = m - 1;
  if (pm === 0) { pm = 12; pa -= 1; }
  const ult = new Date(pa, pm, 0).getDate();
  const mm = String(pm).padStart(2, "0");
  return [`${pa}-${mm}-01`, `${pa}-${mm}-${String(ult).padStart(2, "0")}`];
}

export function ResumenFinanciero({
  ventas,
  compras,
  notas,
}: {
  ventas: DocSii[];
  compras: DocSii[];
  notas: NotaConciliada[];
}) {
  const hoy = hoyChile();
  const [desde, setDesde] = useState(() => `${hoy.slice(0, 7)}-01`); // mes en curso
  const [hasta, setHasta] = useState(hoy);
  const [preset, setPreset] = useState<string>("mes");

  function aplicarPreset(id: string) {
    setPreset(id);
    if (id === "mes") {
      setDesde(`${hoy.slice(0, 7)}-01`);
      setHasta(hoy);
    } else if (id === "mes-ant") {
      const [d, h] = rangoMesAnterior(hoy);
      setDesde(d);
      setHasta(h);
    }
  }

  const enRango = (fecha: string | null) =>
    !!fecha && (!desde || fecha >= desde) && (!hasta || fecha <= hasta);

  const resumen = useMemo(() => {
    const meses = new Map<string, MesAgg>();
    const mes = (fecha: string): MesAgg => {
      const clave = fecha.slice(0, 7);
      let agg = meses.get(clave);
      if (!agg) {
        agg = {
          clave,
          ventas: 0,
          compras: 0,
          margenVenta: 0,
          margenCosto: 0,
          notas: 0,
        };
        meses.set(clave, agg);
      }
      return agg;
    };

    // Margen por día (para el gráfico): venta conciliada = costo + margen.
    const dias = new Map<string, { clave: string; margenVenta: number; margenCosto: number; notas: number }>();
    const dia = (fecha: string) => {
      const clave = fecha.slice(0, 10);
      let agg = dias.get(clave);
      if (!agg) { agg = { clave, margenVenta: 0, margenCosto: 0, notas: 0 }; dias.set(clave, agg); }
      return agg;
    };

    let totalVentas = 0;
    let totalCompras = 0;
    let margenVenta = 0;
    let margenCosto = 0;
    let nNotas = 0;

    for (const v of ventas) {
      if (!enRango(v.fecha)) continue;
      const monto = signoDte(v.tipo_doc) * v.neto;
      totalVentas += monto;
      mes(v.fecha!).ventas += monto;
    }
    for (const c of compras) {
      if (!enRango(c.fecha)) continue;
      const monto = signoDte(c.tipo_doc) * c.neto;
      totalCompras += monto;
      mes(c.fecha!).compras += monto;
    }
    for (const n of notas) {
      if (!enRango(n.fecha)) continue;
      margenVenta += n.venta;
      margenCosto += n.costo;
      nNotas += 1;
      const agg = mes(n.fecha);
      agg.margenVenta += n.venta;
      agg.margenCosto += n.costo;
      agg.notas += 1;
      const ad = dia(n.fecha);
      ad.margenVenta += n.venta;
      ad.margenCosto += n.costo;
      ad.notas += 1;
    }

    const filas = [...meses.values()].sort((a, b) =>
      a.clave.localeCompare(b.clave)
    );
    const diasMargen = [...dias.values()].sort((a, b) =>
      a.clave.localeCompare(b.clave)
    );

    return {
      totalVentas,
      totalCompras,
      margen: margenVenta - margenCosto,
      margenVenta,
      nNotas,
      filas,
      diasMargen,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ventas, compras, notas, desde, hasta]);

  const maxMargenVenta = Math.max(
    ...resumen.diasMargen.map((f) => f.margenVenta),
    1
  );

  const inputCls =
    "rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none";

  const kpis = [
    {
      label: "Ventas SII (neto)",
      value: formatCLP(resumen.totalVentas),
      detail: "Facturas emitidas − notas de crédito",
    },
    {
      label: "Compras SII (neto)",
      value: formatCLP(resumen.totalCompras),
      detail: "Facturas recibidas − notas de crédito",
    },
    {
      label: "Ventas − Compras",
      value: formatCLP(resumen.totalVentas - resumen.totalCompras),
      detail: "Diferencia neta del período",
    },
    {
      label: "Margen conciliado",
      value: `${formatCLP(resumen.margen)} (${pct(resumen.margen, resumen.margenVenta)})`,
      detail: `${resumen.nNotas} nota${resumen.nNotas === 1 ? "" : "s"} con factura SII · sin flete`,
    },
  ];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-6 py-5">
        <h2 className="text-lg font-bold text-slate-900">
          Resumen financiero (SII)
        </h2>
        <div className="flex items-center gap-4 text-sm text-slate-600">
          <span className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: COLOR_MARGEN }}
            />
            Margen
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: COLOR_COSTO }}
            />
            Costo
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-6 p-6">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-wrap gap-1">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => aplicarPreset(p.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  preset === p.id
                    ? "bg-brand-600 text-white"
                    : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <label className="flex flex-col gap-1 text-xs text-slate-500">
            Desde
            <input
              type="date"
              value={desde}
              onChange={(e) => {
                setDesde(e.target.value);
                setPreset("");
              }}
              className={inputCls}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-500">
            Hasta
            <input
              type="date"
              value={hasta}
              onChange={(e) => {
                setHasta(e.target.value);
                setPreset("");
              }}
              className={inputCls}
            />
          </label>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map((kpi) => (
            <div key={kpi.label} className="rounded-xl bg-slate-50 p-5">
              <p className="text-sm font-medium text-slate-500">{kpi.label}</p>
              <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                {kpi.value}
              </p>
              <p className="mt-1.5 text-xs text-slate-500">{kpi.detail}</p>
            </div>
          ))}
        </div>

        {resumen.filas.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-500">
            Sin documentos del SII ni notas conciliadas en el período.
          </p>
        ) : (
          <>
            <div>
              {resumen.diasMargen.length === 0 ? (
                <p className="py-4 text-center text-sm text-slate-500">
                  Sin notas conciliadas en el período (nada que graficar por día).
                </p>
              ) : (
                <div className="flex h-56 items-end gap-1">
                  {resumen.diasMargen.map((f) => {
                    const margen = f.margenVenta - f.margenCosto;
                    const hVenta = Math.round((f.margenVenta / maxMargenVenta) * 100);
                    const hMargen =
                      f.margenVenta > 0 && margen > 0
                        ? Math.round((margen / f.margenVenta) * hVenta)
                        : 0;
                    const hCosto = Math.max(hVenta - hMargen, 0);
                    const titulo = `${etiquetaDia(f.clave)}: venta conciliada ${formatCLP(
                      f.margenVenta
                    )} · costo ${formatCLP(f.margenCosto)} · margen ${formatCLP(margen)} (${pct(
                      margen,
                      f.margenVenta
                    )}) · ${f.notas} nota${f.notas === 1 ? "" : "s"}`;
                    return (
                      <div
                        key={f.clave}
                        title={titulo}
                        className="flex h-full flex-1 flex-col items-center justify-end gap-1"
                      >
                        <div className="flex w-full max-w-10 flex-col justify-end" style={{ height: "88%" }}>
                          {hMargen > 0 && (
                            <div
                              className="w-full rounded-t"
                              style={{ height: `${hMargen}%`, backgroundColor: COLOR_MARGEN, marginBottom: hCosto > 0 ? "2px" : 0 }}
                            />
                          )}
                          {hCosto > 0 && (
                            <div
                              className={`w-full ${hMargen > 0 ? "" : "rounded-t"}`}
                              style={{ height: `${hCosto}%`, backgroundColor: COLOR_COSTO }}
                            />
                          )}
                          {hVenta === 0 && <div className="w-full border-b-2 border-slate-200" />}
                        </div>
                        <span className="text-[10px] text-slate-500">{Number(f.clave.slice(8, 10))}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              <p className="mt-2 text-xs text-slate-400">
                Venta conciliada por día descompuesta en costo + margen (solo
                notas con factura del SII). Pasa el mouse para el detalle.
              </p>
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2">Mes</th>
                    <th className="px-4 py-2 text-right">Ventas SII</th>
                    <th className="px-4 py-2 text-right">Compras SII</th>
                    <th className="px-4 py-2 text-right">Ventas − Compras</th>
                    <th className="px-4 py-2 text-right">Margen</th>
                    <th className="px-4 py-2 text-right">Margen %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {resumen.filas.map((f) => {
                    const margen = f.margenVenta - f.margenCosto;
                    const dif = f.ventas - f.compras;
                    return (
                      <tr key={f.clave} className="text-slate-700">
                        <td className="px-4 py-2 font-medium text-slate-900">
                          {etiquetaMes(f.clave)}
                        </td>
                        <td className="px-4 py-2 text-right">
                          {formatCLP(f.ventas)}
                        </td>
                        <td className="px-4 py-2 text-right">
                          {formatCLP(f.compras)}
                        </td>
                        <td
                          className={`px-4 py-2 text-right font-medium ${
                            dif < 0 ? "text-red-600" : "text-slate-900"
                          }`}
                        >
                          {formatCLP(dif)}
                        </td>
                        <td
                          className={`px-4 py-2 text-right font-medium ${
                            margen < 0 ? "text-red-600" : "text-slate-900"
                          }`}
                        >
                          {formatCLP(margen)}
                        </td>
                        <td className="px-4 py-2 text-right">
                          {pct(margen, f.margenVenta)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-400">
              Montos netos (sin IVA), notas de crédito restando. El margen sale
              solo de las notas de venta con factura del SII vinculada, sin
              flete; los meses sin notas conciliadas muestran margen $0.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
