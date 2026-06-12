import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { actualizarProducto } from "../../actions";
import { ProductoForm } from "../../producto-form";

export default async function EditarProductoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: producto } = await supabase
    .from("productos")
    .select("id, sku, descripcion, costo, precio, activo")
    .eq("id", id)
    .single();

  if (!producto) {
    notFound();
  }

  const action = actualizarProducto.bind(null, id);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-slate-900">
        Editar producto
      </h1>
      <div className="max-w-lg rounded-xl border border-slate-200 bg-white p-6">
        <ProductoForm
          action={action}
          producto={producto}
          submitLabel="Guardar cambios"
        />
      </div>
    </div>
  );
}
