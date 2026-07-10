import { createClient } from "@/lib/supabase/server";
import { PanelesSiiVista, type DocSii, type NotaPagada } from "./paneles-vista";

// Día calendario en horario de Chile ('AAAA-MM-DD').
function diaChile(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
  }).format(new Date(iso));
}

// Paneles del dashboard sobre documentos del SII (ventas/compras por emisión) y
// notas de venta pagadas. Todo por fecha de emisión del documento.
export async function PanelesSii() {
  const supabase = await createClient();

  const [ventasRes, comprasRes, notasRes] = await Promise.all([
    supabase
      .from("ventas_sii")
      .select("fecha_emision, tipo_doc, monto_neto, monto_exento, monto_iva, monto_total, nota_venta_id"),
    supabase
      .from("compras_sii")
      .select("fecha_emision, tipo_doc, monto_neto, monto_exento, monto_iva, monto_total"),
    supabase
      .from("notas_venta")
      .select("total, created_at")
      .eq("estado", "pagada"),
  ]);

  if (ventasRes.error || comprasRes.error || notasRes.error) {
    return (
      <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
        No se pudieron cargar los paneles del SII. Recarga la página.
      </p>
    );
  }

  const ventas: DocSii[] = (ventasRes.data ?? []).map((r) => ({
    fecha: r.fecha_emision,
    tipo_doc: r.tipo_doc,
    neto: (r.monto_neto ?? 0) + (r.monto_exento ?? 0),
    iva: r.monto_iva ?? 0,
    total: r.monto_total ?? 0,
    conciliada: r.nota_venta_id != null,
  }));

  const compras: DocSii[] = (comprasRes.data ?? []).map((r) => ({
    fecha: r.fecha_emision,
    tipo_doc: r.tipo_doc,
    neto: (r.monto_neto ?? 0) + (r.monto_exento ?? 0),
    iva: r.monto_iva ?? 0,
    total: r.monto_total ?? 0,
    conciliada: false,
  }));

  const notasPagadas: NotaPagada[] = (notasRes.data ?? []).map((n) => ({
    fecha: diaChile(n.created_at),
    total: n.total ?? 0,
  }));

  return (
    <PanelesSiiVista ventas={ventas} compras={compras} notasPagadas={notasPagadas} />
  );
}
