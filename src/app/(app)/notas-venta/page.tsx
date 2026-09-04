import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { calcularMargen } from "@/lib/totals";
import { fechaVentaNota } from "@/lib/cobros";
import { diaChile } from "@/lib/fecha";
import { NotasVentaTabla, type NotaVentaRow } from "./notas-venta-tabla";

// Fila tal como vuelve de la consulta: con los ítems, que solo sirven para
// calcular el margen y no viajan al cliente.
type NotaConItems = Omit<
  NotaVentaRow,
  "venta" | "costo" | "cobrado" | "fechaVenta"
> & {
  nota_venta_items: {
    cantidad: number;
    costo: number;
    precio: number;
    descuento: number;
  }[];
  pagos_nota_venta: { monto: number }[];
  ventas_sii: { tipo_doc: number; fecha_emision: string | null }[];
};

export default async function NotasVentaPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("notas_venta")
    .select(
      `id, folio, created_at, total, estado, clientes(nombre), cotizaciones(id, folio),
       nota_venta_items(cantidad, costo, precio, descuento), pagos_nota_venta(monto),
       ventas_sii(tipo_doc, fecha_emision)`
    )
    .order("created_at", { ascending: false });

  // El margen se reduce acá a dos números por nota: mandar los ítems completos
  // al cliente solo para sumarlos sería cargar la página de más.
  const notas: NotaVentaRow[] = (
    (data ?? []) as unknown as NotaConItems[]
  ).map(({ nota_venta_items, pagos_nota_venta, ventas_sii, ...nota }) => {
    const { venta, costo } = calcularMargen(nota_venta_items ?? []);
    return {
      ...nota,
      venta,
      costo,
      cobrado: (pagos_nota_venta ?? []).reduce((s, p) => s + p.monto, 0),
      // La venta se fecha por la emisión de su factura, no por el día en que
      // se digitó la nota: si no, una puesta al día de la carga mete las
      // ventas en el mes equivocado y el listado deja de cuadrar con el SII.
      fechaVenta: fechaVentaNota(ventas_sii ?? [], diaChile(nota.created_at)),
    };
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Notas de Venta</h1>
        <Link
          href="/notas-venta/nueva"
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
        >
          Nueva nota de venta
        </Link>
      </div>

      {error ? (
        <p className="text-sm text-red-600">
          No se pudieron cargar las notas de venta. Intenta nuevamente.
        </p>
      ) : (
        <NotasVentaTabla notas={notas} />
      )}
    </div>
  );
}
