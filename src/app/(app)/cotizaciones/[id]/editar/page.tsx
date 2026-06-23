import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { actualizarCotizacion } from "../../actions";
import {
  CotizacionForm,
  type CotizacionItemInput,
} from "../../cotizacion-form";

type CotizacionEditable = {
  id: string;
  folio: string;
  estado: string;
  cliente_id: string;
  fecha_validez: string;
  medio_pago: string[] | null;
  notas: string | null;
  cotizacion_items: (CotizacionItemInput & { posicion: number })[];
};

export default async function EditarCotizacionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data }, { data: clientes }, { data: productos }] =
    await Promise.all([
      supabase
        .from("cotizaciones")
        .select(
          `id, folio, estado, cliente_id, fecha_validez, medio_pago, notas,
           cotizacion_items(producto_id, sku, descripcion, cantidad, costo, precio, flete, descuento, posicion)`
        )
        .eq("id", id)
        .single(),
      supabase.from("clientes").select("id, nombre, rut").order("nombre"),
      supabase
        .from("productos")
        .select("id, sku, descripcion, costo, precio")
        .eq("activo", true)
        .order("sku"),
    ]);

  if (!data) {
    notFound();
  }

  const cotizacion = data as unknown as CotizacionEditable;

  if (cotizacion.estado !== "borrador") {
    redirect(`/cotizaciones/${id}`);
  }

  const items = [...cotizacion.cotizacion_items]
    .sort((a, b) => a.posicion - b.posicion)
    .map(
      ({ producto_id, sku, descripcion, cantidad, costo, precio, flete, descuento }) => ({
        producto_id,
        sku,
        descripcion,
        cantidad,
        costo,
        precio,
        flete,
        descuento,
      })
    );

  const action = actualizarCotizacion.bind(null, id);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-slate-900">
        Editar cotización {cotizacion.folio}
      </h1>
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <CotizacionForm
          clientes={clientes ?? []}
          productos={productos ?? []}
          cotizacion={{
            cliente_id: cotizacion.cliente_id,
            fecha_validez: cotizacion.fecha_validez,
            medio_pago: cotizacion.medio_pago,
            notas: cotizacion.notas,
            items,
          }}
          action={action}
        />
      </div>
    </div>
  );
}
