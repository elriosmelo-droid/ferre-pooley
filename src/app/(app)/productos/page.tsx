import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatCLP } from "@/lib/money";

type Producto = {
  id: string;
  sku: string;
  descripcion: string;
  costo: number;
  precio: number;
  activo: boolean;
};

function formatMargen(costo: number, precio: number): string {
  if (costo === 0) return "—";
  return `${Math.round(((precio - costo) / costo) * 100)}%`;
}

export default async function ProductosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("productos")
    .select("id, sku, descripcion, costo, precio, activo")
    .order("sku");

  if (q) {
    const term = q.replace(/[,()]/g, " ").trim();
    if (term) {
      query = query.or(`sku.ilike.%${term}%,descripcion.ilike.%${term}%`);
    }
  }

  const { data, error } = await query;
  const productos: Producto[] = data ?? [];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Productos</h1>
        <Link
          href="/productos/nuevo"
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
        >
          Nuevo producto
        </Link>
      </div>

      <form method="GET" className="mb-4 flex max-w-md gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Buscar por SKU o descripción…"
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
          No se pudieron cargar los productos. Intenta nuevamente.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3">Descripción</th>
                <th className="px-4 py-3 text-right">Costo</th>
                <th className="px-4 py-3 text-right">Precio</th>
                <th className="px-4 py-3 text-right">Margen</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {productos.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    {q
                      ? "No se encontraron productos para la búsqueda."
                      : "Aún no hay productos registrados."}
                  </td>
                </tr>
              ) : (
                productos.map((producto) => (
                  <tr
                    key={producto.id}
                    className={
                      producto.activo ? "text-slate-700" : "text-slate-400"
                    }
                  >
                    <td
                      className={`px-4 py-3 font-medium ${
                        producto.activo ? "text-slate-900" : "text-slate-400"
                      }`}
                    >
                      {producto.sku}
                    </td>
                    <td className="px-4 py-3">{producto.descripcion}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatCLP(producto.costo)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatCLP(producto.precio)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatMargen(producto.costo, producto.precio)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          producto.activo
                            ? "bg-green-100 text-green-800"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {producto.activo ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/productos/${producto.id}/editar`}
                        className="text-sm font-medium text-brand-600 hover:text-brand-800"
                      >
                        Editar
                      </Link>
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
