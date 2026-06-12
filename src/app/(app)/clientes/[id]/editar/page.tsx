import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { actualizarCliente } from "../../actions";
import { ClienteForm } from "../../cliente-form";

export default async function EditarClientePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: cliente } = await supabase
    .from("clientes")
    .select("id, nombre, rut, correo, telefono, direccion")
    .eq("id", id)
    .single();

  if (!cliente) {
    notFound();
  }

  const action = actualizarCliente.bind(null, id);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Editar cliente</h1>
      <div className="max-w-lg rounded-xl border border-slate-200 bg-white p-6">
        <ClienteForm
          action={action}
          cliente={cliente}
          submitLabel="Guardar cambios"
        />
      </div>
    </div>
  );
}
