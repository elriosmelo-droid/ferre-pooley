import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatCLP } from "@/lib/money";
import { signoDte } from "@/lib/dte-doc";
import {
  EstadoBadge,
  type CotizacionEstado,
} from "../cotizaciones/estado-badge";
import {
  NotaEstadoBadge,
  type NotaVentaEstado,
} from "../notas-venta/nota-estado-badge";
import { Margenes } from "./margenes";
import { PanelesSii } from "./paneles";

type CotizacionResumen = {
  id: string;
  folio: string;
  total: number;
  estado: CotizacionEstado;
  clientes: { nombre: string } | null;
};

type NotaVentaResumen = {
  id: string;
  folio: string;
  total: number;
  estado: NotaVentaEstado;
  clientes: { nombre: string } | null;
};

// Monto neto (sin IVA) de ventas del mes: facturas suman, NC restan.
function sumarVentaNeta(
  rows: { tipo_doc: number; monto_neto: number; monto_exento: number }[] | null
): number {
  return (rows ?? []).reduce(
    (acc, r) =>
      acc + signoDte(r.tipo_doc) * ((r.monto_neto ?? 0) + (r.monto_exento ?? 0)),
    0
  );
}

type VentaMesRow = {
  tipo_doc: number;
  monto_neto: number;
  monto_exento: number;
  notas_venta: { estado: string } | { estado: string }[] | null;
};

function estadoNotaVenta(r: VentaMesRow): string | null {
  const n = Array.isArray(r.notas_venta) ? r.notas_venta[0] : r.notas_venta;
  return n?.estado ?? null;
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const ahora = new Date();
  // Primer día del mes en curso como fecha ('AAAA-MM-01') para comparar contra
  // fecha_emision (columna date).
  const inicioMesFecha = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}-01`;

  const [
    ventasMesResult,
    comprasMesResult,
    ultimasCotizacionesResult,
    ultimasNotasResult,
  ] = await Promise.all([
    // Ventas del SII emitidas este mes + estado de la nota vinculada.
    supabase
      .from("ventas_sii")
      .select("tipo_doc, monto_neto, monto_exento, notas_venta(estado)")
      .gte("fecha_emision", inicioMesFecha),
    // Compras del SII recibidas (emitidas) este mes.
    supabase
      .from("compras_sii")
      .select("tipo_doc, monto_neto, monto_exento")
      .gte("fecha_emision", inicioMesFecha),
    supabase
      .from("cotizaciones")
      .select("id, folio, total, estado, clientes(nombre)")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("notas_venta")
      .select("id, folio, total, estado, clientes(nombre)")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const hayErrores = [
    ventasMesResult,
    comprasMesResult,
    ultimasCotizacionesResult,
    ultimasNotasResult,
  ].some((r) => r.error);

  const ventasMes = (ventasMesResult.data ?? []) as unknown as VentaMesRow[];
  const montoVentaMes = sumarVentaNeta(ventasMes);
  // Cobrado = facturas del mes cuya nota vinculada está pagada. Por cobrar = el
  // resto (facturas sin nota o con nota pendiente). Todo neto, NC restan.
  const cobradoMes = sumarVentaNeta(
    ventasMes.filter((r) => estadoNotaVenta(r) === "pagada")
  );
  const porCobrarMes = montoVentaMes - cobradoMes;
  // Por pagar = neto de las compras del mes (no se registra pago de compras).
  const porPagarMes = sumarVentaNeta(comprasMesResult.data);

  const stats = [
    {
      label: "Monto venta del mes",
      value: formatCLP(montoVentaMes),
      detail: "Neto facturado este mes (NC restan)",
    },
    {
      label: "Ventas del mes",
      value: formatCLP(cobradoMes),
      detail: "Neto ya cobrado de facturas del mes",
    },
    {
      label: "Por cobrar del mes",
      value: formatCLP(porCobrarMes),
      detail: "Ventas del mes aún sin pagar (neto)",
    },
    {
      label: "Por pagar del mes",
      value: formatCLP(porPagarMes),
      detail: "Neto de compras del mes (NC restan)",
    },
  ];

  const ultimasCotizaciones = (ultimasCotizacionesResult.data ??
    []) as unknown as CotizacionResumen[];
  const ultimasNotas = (ultimasNotasResult.data ??
    []) as unknown as NotaVentaResumen[];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900">Dashboard</h1>

      {hayErrores && (
        <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          No se pudieron cargar todas las métricas. Recarga la página.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              {stat.label}
            </p>
            <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              {stat.value}
            </p>
            <p className="mt-1.5 text-xs text-slate-500">{stat.detail}</p>
          </div>
        ))}
      </div>

      <Margenes />

      <PanelesSii />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Últimas cotizaciones
            </h2>
            <Link
              href="/cotizaciones"
              className="text-sm font-medium text-brand-600 hover:text-brand-800"
            >
              Ver todas
            </Link>
          </div>
          {ultimasCotizaciones.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-slate-500">
              Aún no hay cotizaciones.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {ultimasCotizaciones.map((cotizacion) => (
                <li key={cotizacion.id}>
                  <Link
                    href={`/cotizaciones/${cotizacion.id}`}
                    className="flex items-center justify-between gap-3 px-6 py-3 transition-colors hover:bg-slate-50"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900">
                        {cotizacion.folio}
                      </p>
                      <p className="truncate text-sm text-slate-500">
                        {cotizacion.clientes?.nombre ?? "—"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-sm font-medium text-slate-900">
                        {formatCLP(cotizacion.total)}
                      </span>
                      <EstadoBadge estado={cotizacion.estado} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Últimas notas de venta
            </h2>
            <Link
              href="/notas-venta"
              className="text-sm font-medium text-brand-600 hover:text-brand-800"
            >
              Ver todas
            </Link>
          </div>
          {ultimasNotas.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-slate-500">
              Aún no hay notas de venta.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {ultimasNotas.map((nota) => (
                <li key={nota.id}>
                  <Link
                    href={`/notas-venta/${nota.id}`}
                    className="flex items-center justify-between gap-3 px-6 py-3 transition-colors hover:bg-slate-50"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900">
                        {nota.folio}
                      </p>
                      <p className="truncate text-sm text-slate-500">
                        {nota.clientes?.nombre ?? "—"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-sm font-medium text-slate-900">
                        {formatCLP(nota.total)}
                      </span>
                      <NotaEstadoBadge estado={nota.estado} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
