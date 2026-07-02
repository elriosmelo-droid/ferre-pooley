import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { actualizarNotaVenta } from "../../actions";
import { NotaVentaForm, type NotaVentaItemInput } from "../../nota-venta-form";

type NotaEditable = {
  id: string;
  folio: string;
  estado: string;
  cliente_id: string;
  medio_pago: string[] | null;
  nota_venta_items: (Omit<NotaVentaItemInput, "producto_id"> & {
    posicion: number;
  })[];
};

export default async function EditarNotaVentaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data }, { data: clientes }, { data: productos }] =
    await Promise.all([
      supabase
        .from("notas_venta")
        .select(
          `id, folio, estado, cliente_id, medio_pago,
           nota_venta_items(sku, descripcion, cantidad, costo, precio, flete, descuento, posicion)`
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

  const nota = data as unknown as NotaEditable;

  if (nota.estado !== "pendiente") {
    redirect(`/notas-venta/${id}`);
  }

  // nota_venta_items no guarda producto_id: todas las filas se editan libres.
  const items: NotaVentaItemInput[] = [...nota.nota_venta_items]
    .sort((a, b) => a.posicion - b.posicion)
    .map(({ sku, descripcion, cantidad, costo, precio, flete, descuento }) => ({
      producto_id: null,
      sku,
      descripcion,
      cantidad,
      costo,
      precio,
      flete,
      descuento,
    }));

  const action = actualizarNotaVenta.bind(null, id);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-slate-900">
        Editar nota de venta {nota.folio}
      </h1>
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <NotaVentaForm
          clientes={clientes ?? []}
          productos={productos ?? []}
          nota={{
            cliente_id: nota.cliente_id,
            medio_pago: nota.medio_pago,
            items,
          }}
          action={action}
        />
      </div>
    </div>
  );
}
