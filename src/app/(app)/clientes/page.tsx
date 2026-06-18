import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { DeleteClienteButton } from "./delete-cliente-button";

type Cliente = {
  id: string;
  nombre: string;
  rut: string | null;
  correo: string;
  telefono: string | null;
};

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("clientes")
    .select("id, nombre, rut, correo, telefono")
    .order("nombre");

  if (q) {
    const term = q.replace(/[,()]/g, " ").trim();
    if (term) {
      query = query.or(`nombre.ilike.%${term}%,rut.ilike.%${term}%`);
    }
  }

  const { data, error } = await query;
  const clientes: Cliente[] = data ?? [];

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

      <form method="GET" className="mb-4 flex max-w-md gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Buscar por nombre o RUT…"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
        <button
          type="submit"
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
        >
          Buscar
        </button>
      </form>

      {error ? (
        <p className="text-sm text-red-600">
          No se pudieron cargar los clientes. Intenta nuevamente.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">RUT</th>
                <th className="px-4 py-3">Correo</th>
                <th className="px-4 py-3">Teléfono</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {clientes.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    {q
                      ? "No se encontraron clientes para la búsqueda."
                      : "Aún no hay clientes registrados."}
                  </td>
                </tr>
              ) : (
                clientes.map((cliente) => (
                  <tr key={cliente.id} className="text-slate-700">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {cliente.nombre}
                    </td>
                    <td className="px-4 py-3">{cliente.rut ?? "—"}</td>
                    <td className="px-4 py-3">{cliente.correo}</td>
                    <td className="px-4 py-3">{cliente.telefono ?? "—"}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-4">
                        <Link
                          href={`/clientes/${cliente.id}/editar`}
                          className="text-sm font-medium text-brand-600 hover:text-brand-800"
                        >
                          Editar
                        </Link>
                        <DeleteClienteButton
                          id={cliente.id}
                          nombre={cliente.nombre}
                        />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
