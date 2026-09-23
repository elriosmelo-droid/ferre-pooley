import { createClient } from "@/lib/supabase/server";
import { normalizarRut } from "@/lib/rut";
import { EstadosCuentaLista, type ClienteLista } from "./estados-cuenta-lista";
import { requirePermiso } from "@/lib/auth/rol";

export default async function EstadosCuentaPage() {
  const perfil = await requirePermiso("estados_cuenta");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("clientes")
    .select("id, nombre, rut")
    .order("nombre");

  const clientes = (data ?? []) as ClienteLista[];

  // Un vendedor ve el catálogo completo de clientes, pero su estado de cuenta
  // solo tiene sentido con los clientes a los que les ha facturado.
  let visibles = clientes;
  if (perfil.rol !== "admin") {
    const { data: ventas } = await supabase.from("ventas_sii").select("rut_cliente");
    const ruts = new Set((ventas ?? []).map((v) => normalizarRut(v.rut_cliente)));
    visibles = clientes.filter((c) => ruts.has(normalizarRut(c.rut)));
  }

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
        <EstadosCuentaLista clientes={visibles} />
      )}
    </div>
  );
}
