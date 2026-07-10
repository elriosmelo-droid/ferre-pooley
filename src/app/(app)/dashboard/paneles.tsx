import { createClient } from "@/lib/supabase/server";
import { PanelesSiiVista, type DocSii } from "./paneles-vista";
import type { EstadoPago } from "@/lib/estado-cuenta";

// El ciclo de venta se fecha por EMISIÓN de la factura: "conciliada" = factura
// con nota vinculada; "pagada" = esa nota está pagada. Así el embudo es
// monótono (facturas ≥ conciliadas ≥ pagadas) y nunca supera lo facturado.
type VentaEmbed = {
  fecha_emision: string | null;
  tipo_doc: number;
  monto_neto: number;
  monto_exento: number;
  monto_iva: number;
  monto_total: number;
  nota_venta_id: string | null;
  notas_venta: { estado: EstadoPago } | { estado: EstadoPago }[] | null;
};

function estadoNota(v: VentaEmbed): EstadoPago | null {
  const n = Array.isArray(v.notas_venta) ? v.notas_venta[0] : v.notas_venta;
  return n?.estado ?? null;
}

export async function PanelesSii() {
  const supabase = await createClient();

  const [ventasRes, comprasRes] = await Promise.all([
    supabase
      .from("ventas_sii")
      .select("fecha_emision, tipo_doc, monto_neto, monto_exento, monto_iva, monto_total, nota_venta_id, notas_venta(estado)"),
    supabase
      .from("compras_sii")
      .select("fecha_emision, tipo_doc, monto_neto, monto_exento, monto_iva, monto_total"),
  ]);

  if (ventasRes.error || comprasRes.error) {
    return (
      <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
        No se pudieron cargar los paneles del SII. Recarga la página.
      </p>
    );
  }

  const ventas: DocSii[] = ((ventasRes.data ?? []) as unknown as VentaEmbed[]).map((r) => ({
    fecha: r.fecha_emision,
    tipo_doc: r.tipo_doc,
    neto: (r.monto_neto ?? 0) + (r.monto_exento ?? 0),
    iva: r.monto_iva ?? 0,
    total: r.monto_total ?? 0,
    conciliada: r.nota_venta_id != null,
    notaEstado: estadoNota(r),
  }));

  const compras: DocSii[] = (comprasRes.data ?? []).map((r) => ({
    fecha: r.fecha_emision,
    tipo_doc: r.tipo_doc,
    neto: (r.monto_neto ?? 0) + (r.monto_exento ?? 0),
    iva: r.monto_iva ?? 0,
    total: r.monto_total ?? 0,
    conciliada: false,
    notaEstado: null,
  }));

  return <PanelesSiiVista ventas={ventas} compras={compras} />;
}
