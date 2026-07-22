import { createClient } from "@/lib/supabase/server";
import { descuentoUnitario } from "@/lib/totals";
import { TIPOS_AUTO_VINCULO } from "@/lib/dte-doc";
import {
  ResumenFinanciero,
  type DocSii,
  type NotaConciliada,
} from "./resumen-financiero";

type NotaMargen = {
  id: string;
  created_at: string;
  estado: string;
  nota_venta_items: {
    cantidad: number;
    costo: number;
    precio: number;
    descuento: number;
  }[];
  ventas_sii: { id: string; tipo_doc: number; fecha_emision: string | null }[];
};

// Día calendario en horario de Chile ('AAAA-MM-DD').
function diaChile(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
  }).format(new Date(iso));
}

// Sección financiera del dashboard: compras y ventas del SII + margen de las
// notas de venta conciliadas (con factura vinculada), con filtros de fecha.
// Los montos van NETOS (sin IVA); el margen usa la misma fórmula que
// "Margen (interno)" del detalle de nota: cant × (precio − desc − costo).
export async function Margenes() {
  const supabase = await createClient();

  const [ventasResult, comprasResult, notasResult] = await Promise.all([
    supabase
      .from("ventas_sii")
      .select("fecha_emision, tipo_doc, monto_neto, monto_exento"),
    supabase
      .from("compras_sii")
      .select("fecha_emision, tipo_doc, monto_neto, monto_exento"),
    supabase
      .from("notas_venta")
      .select(
        `id, created_at, estado,
         nota_venta_items(cantidad, costo, precio, descuento),
         ventas_sii(id, tipo_doc, fecha_emision)`
      )
      .neq("estado", "anulada"),
  ]);

  if (ventasResult.error || comprasResult.error || notasResult.error) {
    return (
      <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
        No se pudo cargar el resumen financiero. Recarga la página.
      </p>
    );
  }

  const aDoc = (r: {
    fecha_emision: string | null;
    tipo_doc: number;
    monto_neto: number;
    monto_exento: number;
  }): DocSii => ({
    fecha: r.fecha_emision,
    tipo_doc: r.tipo_doc,
    neto: (r.monto_neto ?? 0) + (r.monto_exento ?? 0),
  });

  const ventas = (ventasResult.data ?? []).map(aDoc);
  const compras = (comprasResult.data ?? []).map(aDoc);

  const notas: NotaConciliada[] = (
    (notasResult.data ?? []) as unknown as NotaMargen[]
  )
    .filter((n) =>
      n.ventas_sii.some((v) => TIPOS_AUTO_VINCULO.includes(v.tipo_doc))
    )
    .map((n) => {
      let venta = 0;
      let costo = 0;
      for (const item of n.nota_venta_items) {
        const precioNeto =
          item.precio - descuentoUnitario(item.precio, item.descuento);
        venta += item.cantidad * precioNeto;
        costo += item.cantidad * item.costo;
      }
      // Se fecha por la EMISIÓN de la factura vinculada (33/34), no por la
      // creación de la nota, para que calce con ventas/compras al filtrar por
      // mes. Si hay varias, la más antigua; fallback a created_at.
      const fechaFactura = n.ventas_sii
        .filter((v) => TIPOS_AUTO_VINCULO.includes(v.tipo_doc) && v.fecha_emision)
        .map((v) => v.fecha_emision!.slice(0, 10))
        .sort()[0];
      return {
        fecha: fechaFactura ?? diaChile(n.created_at),
        venta,
        costo,
        pagada: n.estado === "pagada",
      };
    });

  return (
    <ResumenFinanciero ventas={ventas} compras={compras} notas={notas} />
  );
}
