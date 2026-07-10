import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatCLP } from "@/lib/money";
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

function sumarTotales(rows: { total: number }[] | null) {
  return (rows ?? []).reduce((acc, row) => acc + row.total, 0);
}

type VentaConNota = {
  notas_venta: { id: string; total: number; estado: string } | { id: string; total: number; estado: string }[] | null;
};

// Suma el total de las notas PAGADAS vinculadas a las facturas dadas, sin
// duplicar una nota que aparezca en más de una factura.
function sumarNotasPagadas(rows: VentaConNota[] | null): number {
  const vistos = new Set<string>();
  let total = 0;
  for (const r of rows ?? []) {
    const n = Array.isArray(r.notas_venta) ? r.notas_venta[0] : r.notas_venta;
    if (!n || n.estado !== "pagada" || vistos.has(n.id)) continue;
    vistos.add(n.id);
    total += n.total ?? 0;
  }
  return total;
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const ahora = new Date();
  const inicioMes = new Date(
    ahora.getFullYear(),
    ahora.getMonth(),
    1
  ).toISOString();
  // Primer día del mes en curso como fecha ('AAAA-MM-01') para comparar contra
  // ventas_sii.fecha_emision (columna date).
  const inicioMesFecha = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}-01`;

  const [
    enviadasResult,
    aceptadasMesResult,
    porCobrarResult,
    ventasMesResult,
    ultimasCotizacionesResult,
    ultimasNotasResult,
  ] = await Promise.all([
    supabase
      .from("cotizaciones")
      .select("id", { count: "exact", head: true })
      .eq("estado", "enviada"),
    supabase
      .from("cotizaciones")
      .select("id", { count: "exact", head: true })
      .eq("estado", "aceptada")
      .gte("respondida_at", inicioMes),
    supabase.from("notas_venta").select("total").eq("estado", "pendiente"),
    // Ventas del mes: notas pagadas cuya FACTURA del SII se emitió este mes. Se
    // fecha por la emisión de la factura vinculada (ventas_sii.fecha_emision),
    // NO por cuándo entró el pago ni cuándo se creó la nota. Así una nota pagada
    // de una factura de otro período no cuenta acá.
    supabase
      .from("ventas_sii")
      .select("notas_venta(id, total, estado)")
      .in("tipo_doc", [33, 34])
      .gte("fecha_emision", inicioMesFecha)
      .not("nota_venta_id", "is", null),
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
    enviadasResult,
    aceptadasMesResult,
    porCobrarResult,
    ventasMesResult,
    ultimasCotizacionesResult,
    ultimasNotasResult,
  ].some((r) => r.error);

  const stats = [
    {
      label: "Cotizaciones enviadas",
      value: String(enviadasResult.count ?? 0),
      detail: "Esperando respuesta del cliente",
    },
    {
      label: "Aceptadas este mes",
      value: String(aceptadasMesResult.count ?? 0),
      detail: "Cotizaciones aceptadas",
    },
    {
      label: "Por cobrar",
      value: formatCLP(sumarTotales(porCobrarResult.data)),
      detail: "Notas de venta pendientes de pago",
    },
    {
      label: "Ventas del mes",
      value: formatCLP(
        sumarNotasPagadas(ventasMesResult.data as unknown as VentaConNota[])
      ),
      detail: "Facturas emitidas este mes con nota pagada",
    },
  ];

  const ultimasCotizaciones = (ultimasCotizacionesResult.data ??
    []) as unknown as CotizacionResumen[];
  const ultimasNotas = (ultimasNotasResult.data ??
    []) as unknown as NotaVentaResumen[];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>

      {hayErrores && (
        <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          No se pudieron cargar todas las métricas. Recarga la página.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-slate-200 bg-white p-6"
          >
            <p className="text-sm font-medium text-slate-500">{stat.label}</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">
              {stat.value}
            </p>
            <p className="mt-1 text-xs text-slate-500">{stat.detail}</p>
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
