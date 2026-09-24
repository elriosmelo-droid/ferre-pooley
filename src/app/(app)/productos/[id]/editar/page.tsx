import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { actualizarProducto } from "../../actions";
import { ProductoForm } from "../../producto-form";
import { requirePermiso } from "@/lib/auth/rol";
import { puedeVerCostos } from "@/lib/auth/permisos";
import { proveedoresOpciones } from "../../proveedores-opciones";
import { EliminarProductoButton } from "../../eliminar-producto-button";

export default async function EditarProductoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const perfil = await requirePermiso("productos", "escritura");
  const verCostos = puedeVerCostos(perfil);
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: producto }, proveedores] = await Promise.all([
    supabase
      .from("productos")
      .select(
        "id, sku, sku_proveedor, descripcion, marca, unidad, proveedor_id, costo, precio, activo"
      )
      .eq("id", id)
      .single(),
    proveedoresOpciones(perfil),
  ]);

  if (!producto) {
    notFound();
  }

  const action = actualizarProducto.bind(null, id);

  return (
    <div>
      <div className="mb-6 flex max-w-lg items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Editar producto</h1>
        <EliminarProductoButton id={producto.id} sku={producto.sku} />
      </div>
      <div className="max-w-lg rounded-xl border border-slate-200 bg-white p-6">
        <ProductoForm
          action={action}
          producto={verCostos ? producto : { ...producto, costo: 0 }}
          verCostos={verCostos}
          proveedores={proveedores}
          submitLabel="Guardar cambios"
        />
      </div>
    </div>
  );
}
