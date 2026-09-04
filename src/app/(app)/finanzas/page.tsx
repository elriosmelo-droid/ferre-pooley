import { createClient } from "@/lib/supabase/server";
import { calcularMargen } from "@/lib/totals";
import { vencimientoEfectivo } from "@/lib/estado-cuenta";
import { esNotaCredito } from "@/lib/dte-doc";
import type { NotaCobrable } from "@/lib/cobros";
import { FinanzasVista } from "./finanzas-vista";

type NotaQuery = {
  id: string;
  folio: string;
  total: number;
  estado: string;
  created_at: string;
  clientes: { nombre: string } | null;
  nota_venta_items: {
    cantidad: number;
    costo: number;
    precio: number;
    descuento: number;
  }[];
  pagos_nota_venta: {
    id: string;
    monto: number;
    fecha: string;
    medio_pago: string | null;
    observacion: string | null;
  }[];
};

type VentaQuery = {
  nota_venta_id: string | null;
  tipo_doc: number;
  monto_total: number;
  fecha_emision: string | null;
  forma_pago: number | null;
  term_pago_dias: number | null;
  fecha_vencimiento_manual: string | null;
};

// Fecha de la venta en hora de Chile: created_at es timestamptz y el servidor
// corre en UTC, así que cortar el ISO directo corre el día durante la noche.
function fechaChile(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
  }).format(new Date(iso));
}

export default async function FinanzasPage() {
  const supabase = await createClient();

  const [{ data: notasData, error }, { data: ventasData }] = await Promise.all([
    supabase
      .from("notas_venta")
      .select(
        `id, folio, total, estado, created_at, clientes(nombre),
         nota_venta_items(cantidad, costo, precio, descuento),
         pagos_nota_venta(id, monto, fecha, medio_pago, observacion)`
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("ventas_sii")
      .select(
        "nota_venta_id, tipo_doc, monto_total, fecha_emision, forma_pago, term_pago_dias, fecha_vencimiento_manual"
      ),
  ]);

  const ventas = (ventasData ?? []) as VentaQuery[];

  // Vencimiento de cada nota = el más temprano de sus facturas. Las notas de
  // crédito no vencen, así que no entran.
  const vencePorNota = new Map<string, string>();
  for (const v of ventas) {
    if (!v.nota_venta_id || esNotaCredito(v.tipo_doc)) continue;
    const venc = vencimientoEfectivo(
      v.fecha_vencimiento_manual,
      v.fecha_emision,
      v.forma_pago,
      v.term_pago_dias
    );
    if (!venc) continue;
    const actual = vencePorNota.get(v.nota_venta_id);
    if (!actual || venc < actual) vencePorNota.set(v.nota_venta_id, venc);
  }

  const notas: (NotaCobrable & { folio: string; cliente: string })[] = (
    (notasData ?? []) as unknown as NotaQuery[]
  ).map((n) => {
    const { margen } = calcularMargen(n.nota_venta_items ?? []);
    return {
      id: n.id,
      folio: n.folio,
      cliente: n.clientes?.nombre ?? "—",
      total: n.total,
      margen,
      anulada: n.estado === "anulada",
      fechaVenta: fechaChile(n.created_at),
      vencimiento: vencePorNota.get(n.id) ?? null,
      cobros: n.pagos_nota_venta ?? [],
    };
  });

  // Facturas del SII sin nota vinculada: no tienen costo conocido, así que
  // quedan fuera del cálculo. Se declara en pantalla en vez de esconderlo.
  const sueltas = ventas.filter(
    (v) => !v.nota_venta_id && !esNotaCredito(v.tipo_doc)
  );
  const sinNota = {
    cantidad: sueltas.length,
    monto: sueltas.reduce((s, v) => s + (v.monto_total ?? 0), 0),
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Finanzas</h1>
        <p className="mt-1 text-sm text-slate-500">
          La ruta del dinero: cuánto de lo vendido y de la utilidad entró
          efectivamente a caja.
        </p>
      </div>

      {error ? (
        <p className="text-sm text-red-600">
          No se pudieron cargar los datos. Intenta nuevamente.
        </p>
      ) : (
        <FinanzasVista notas={notas} sinNota={sinNota} />
      )}
    </div>
  );
}
