import { createClient } from "@/lib/supabase/server";
import { formatCLP } from "@/lib/money";
import { descuentoUnitario } from "@/lib/totals";
import { TIPOS_AUTO_VINCULO } from "@/lib/dte-doc";

// Colores de las series (validados: contraste, CVD y croma OK sobre blanco).
const COLOR_MARGEN = "#d80018";
const COLOR_COSTO = "#1d4ed8";

type NotaMargen = {
  id: string;
  created_at: string;
  nota_venta_items: {
    cantidad: number;
    costo: number;
    precio: number;
    descuento: number;
  }[];
  ventas_sii: { id: string; tipo_doc: number }[];
};

type MesAgg = {
  clave: string; // 'AAAA-MM'
  etiqueta: string; // 'jun 26'
  venta: number;
  costo: number;
  margen: number;
  notas: number;
};

// Mes calendario en horario de Chile.
function mesChile(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
  }).format(new Date(iso)); // 'AAAA-MM'
}

function etiquetaMes(clave: string): string {
  const [anio, mes] = clave.split("-").map(Number);
  const nombres = [
    "ene", "feb", "mar", "abr", "may", "jun",
    "jul", "ago", "sep", "oct", "nov", "dic",
  ];
  return `${nombres[mes - 1]} ${String(anio).slice(2)}`;
}

// Últimos 6 meses calendario (incluido el actual), claves 'AAAA-MM'.
function ultimosMeses(n: number): string[] {
  const actual = mesChile(new Date().toISOString());
  let [anio, mes] = actual.split("-").map(Number);
  const claves: string[] = [];
  for (let i = 0; i < n; i++) {
    claves.unshift(`${anio}-${String(mes).padStart(2, "0")}`);
    mes -= 1;
    if (mes === 0) {
      mes = 12;
      anio -= 1;
    }
  }
  return claves;
}

function pct(margen: number, venta: number): string {
  if (venta === 0) return "—";
  return `${Math.round((margen / venta) * 100)}%`;
}

// Margen de las notas de venta CONCILIADAS (con al menos una factura del SII
// vinculada): venta y costo netos por ítem, sin IVA y sin flete (el flete es
// traspaso, no margen) — misma fórmula que "Margen (interno)" del detalle.
export async function Margenes() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("notas_venta")
    .select(
      `id, created_at,
       nota_venta_items(cantidad, costo, precio, descuento),
       ventas_sii(id, tipo_doc)`
    )
    .neq("estado", "anulada");

  if (error) {
    return (
      <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
        No se pudieron cargar los márgenes. Recarga la página.
      </p>
    );
  }

  const notas = (data ?? []) as unknown as NotaMargen[];
  const conciliadas = notas.filter((n) =>
    n.ventas_sii.some((v) => TIPOS_AUTO_VINCULO.includes(v.tipo_doc))
  );

  const meses = ultimosMeses(6);
  const porMes = new Map<string, MesAgg>(
    meses.map((clave) => [
      clave,
      { clave, etiqueta: etiquetaMes(clave), venta: 0, costo: 0, margen: 0, notas: 0 },
    ])
  );

  for (const nota of conciliadas) {
    const agg = porMes.get(mesChile(nota.created_at));
    if (!agg) continue; // más antigua que la ventana
    for (const item of nota.nota_venta_items) {
      const precioNeto =
        item.precio - descuentoUnitario(item.precio, item.descuento);
      agg.venta += item.cantidad * precioNeto;
      agg.costo += item.cantidad * item.costo;
    }
    agg.notas += 1;
  }
  for (const agg of porMes.values()) {
    agg.margen = agg.venta - agg.costo;
  }

  const filas = meses.map((clave) => porMes.get(clave)!);
  const mesActual = filas[filas.length - 1];
  const maxVenta = Math.max(...filas.map((f) => f.venta), 1);

  const kpis = [
    {
      label: "Venta conciliada del mes",
      value: formatCLP(mesActual.venta),
      detail: `${mesActual.notas} nota${mesActual.notas === 1 ? "" : "s"} con factura SII`,
    },
    {
      label: "Costo del mes",
      value: formatCLP(mesActual.costo),
      detail: "Costo de los ítems vendidos",
    },
    {
      label: "Margen del mes",
      value: formatCLP(mesActual.margen),
      detail: "Venta neta menos costo (sin flete)",
    },
    {
      label: "Margen %",
      value: pct(mesActual.margen, mesActual.venta),
      detail: "Sobre la venta neta conciliada",
    },
  ];

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-6 py-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Márgenes (notas con factura SII)
        </h2>
        <div className="flex items-center gap-4 text-xs text-slate-600">
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map((kpi) => (
            <div key={kpi.label} className="rounded-lg bg-slate-50 p-4">
              <p className="text-sm font-medium text-slate-500">{kpi.label}</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">
                {kpi.value}
              </p>
              <p className="mt-1 text-xs text-slate-500">{kpi.detail}</p>
            </div>
          ))}
        </div>

        {conciliadas.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-500">
            Aún no hay notas de venta con factura del SII vinculada. Vincula
            facturas en el detalle de cada nota (o espera el cruce automático)
            para ver márgenes reales aquí.
          </p>
        ) : (
          <div>
            <div className="flex h-48 items-end gap-3">
              {filas.map((f) => {
                const hVenta = Math.round((f.venta / maxVenta) * 100);
                const hMargen =
                  f.venta > 0 && f.margen > 0
                    ? Math.round((f.margen / f.venta) * hVenta)
                    : 0;
                const hCosto = Math.max(hVenta - hMargen, 0);
                const titulo = `${f.etiqueta}: venta ${formatCLP(f.venta)} · costo ${formatCLP(
                  f.costo
                )} · margen ${formatCLP(f.margen)} (${pct(f.margen, f.venta)}) · ${f.notas} notas`;
                return (
                  <div
                    key={f.clave}
                    title={titulo}
                    className="flex h-full flex-1 flex-col items-center justify-end gap-1"
                  >
                    <span
                      className={`text-xs font-medium ${
                        f.margen < 0 ? "text-red-600" : "text-slate-600"
                      }`}
                    >
                      {f.venta > 0 ? pct(f.margen, f.venta) : ""}
                    </span>
                    <div
                      className="flex w-full max-w-16 flex-col justify-end"
                      style={{ height: "85%" }}
                    >
                      {hMargen > 0 && (
                        <div
                          className="w-full rounded-t"
                          style={{
                            height: `${hMargen}%`,
                            backgroundColor: COLOR_MARGEN,
                            marginBottom: hCosto > 0 ? "2px" : 0,
                          }}
                        />
                      )}
                      {hCosto > 0 && (
                        <div
                          className={`w-full ${hMargen > 0 ? "" : "rounded-t"}`}
                          style={{
                            height: `${hCosto}%`,
                            backgroundColor: COLOR_COSTO,
                          }}
                        />
                      )}
                      {hVenta === 0 && (
                        <div className="w-full border-b-2 border-slate-200" />
                      )}
                    </div>
                    <span className="text-xs text-slate-500">{f.etiqueta}</span>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-slate-400">
              Venta neta por mes descompuesta en costo + margen. Sin IVA ni
              flete. Solo notas con factura del SII vinculada; % = margen sobre
              venta neta. Pasa el mouse por una barra para el detalle.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
