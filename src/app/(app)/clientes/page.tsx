import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ClientesTabla, type ClienteRow } from "./clientes-tabla";

export default async function ClientesPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("clientes")
    .select("id, nombre, rut, correo, telefono")
    .order("nombre");

  const clientes = (data ?? []) as unknown as ClienteRow[];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Clientes</h1>
        <Link
          href="/clientes/nuevo"
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
        >
          Nuevo cliente
        </Link>
      </div>

      {error ? (
        <p className="text-sm text-red-600">
          No se pudieron cargar los clientes. Intenta nuevamente.
        </p>
      ) : (
        <ClientesTabla clientes={clientes} />
      )}
    </div>
  );
}
