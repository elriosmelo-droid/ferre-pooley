import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { actualizarOrdenCompra } from "../../actions";
import {
  OrdenCompraForm,
  type OrdenCompraItemInput,
} from "../../orden-compra-form";

type ItemRow = {
  producto_id: string | null;
  sku: string;
  descripcion: string;
  cantidad: number;
  precio: number;
  posicion: number;
};

export default async function EditarOrdenCompraPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: orden }, { data: proveedores }, { data: productos }] =
    await Promise.all([
      supabase
        .from("ordenes_compra")
        .select(
          `id, proveedor_id, estado, notas, plazo_pago,
           orden_compra_items(producto_id, sku, descripcion, cantidad, precio, posicion)`
        )
        .eq("id", id)
        .single(),
      supabase
        .from("proveedores")
        .select("id, razon_social, rut, correo")
        .order("razon_social", { ascending: true, nullsFirst: false }),
      supabase
        .from("productos")
        .select("id, sku, descripcion")
        .eq("activo", true)
        .order("sku"),
    ]);

  if (!orden) {
    notFound();
  }
  if (orden.estado !== "borrador") {
    redirect(`/ordenes-compra/${id}`);
  }

  const items: OrdenCompraItemInput[] = [
    ...(orden.orden_compra_items as unknown as ItemRow[]),
  ]
    .sort((a, b) => a.posicion - b.posicion)
    .map((it) => ({
      producto_id: it.producto_id,
      sku: it.sku,
      descripcion: it.descripcion,
      cantidad: it.cantidad,
      precio: it.precio,
    }));

  const action = actualizarOrdenCompra.bind(null, id);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-slate-900">
        Editar orden de compra
      </h1>
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <OrdenCompraForm
          proveedores={proveedores ?? []}
          productos={productos ?? []}
          orden={{
            proveedor_id: orden.proveedor_id,
            notas: orden.notas,
            plazo_pago: orden.plazo_pago,
            items,
          }}
          action={action}
        />
      </div>
    </div>
  );
}
