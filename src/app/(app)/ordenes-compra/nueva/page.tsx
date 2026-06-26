import { createClient } from "@/lib/supabase/server";
import { crearOrdenCompra } from "../actions";
import { OrdenCompraForm } from "../orden-compra-form";

export default async function NuevaOrdenCompraPage() {
  const supabase = await createClient();

  const [{ data: proveedores }, { data: productos }] = await Promise.all([
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

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-slate-900">
        Nueva orden de compra
      </h1>
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <OrdenCompraForm
          proveedores={proveedores ?? []}
          productos={productos ?? []}
          action={crearOrdenCompra}
        />
      </div>
    </div>
  );
}
