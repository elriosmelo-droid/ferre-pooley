import { createClient } from "@/lib/supabase/server";
import { EstadosCuentaLista, type ClienteLista } from "./estados-cuenta-lista";

export default async function EstadosCuentaPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("clientes")
    .select("id, nombre, rut")
    .order("nombre");

  const clientes = (data ?? []) as ClienteLista[];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Estados de cuenta</h1>
        <p className="mt-1 text-sm text-slate-500">
          Elige un cliente para ver sus documentos del SII y el saldo pendiente.
        </p>
      </div>

      {error ? (
        <p className="text-sm text-red-600">
          No se pudieron cargar los clientes. Intenta nuevamente.
        </p>
      ) : (
        <EstadosCuentaLista clientes={clientes} />
      )}
    </div>
  );
}
