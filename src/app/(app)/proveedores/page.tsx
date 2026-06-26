import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatCLP } from "@/lib/money";
import { TIPOS_PROVEEDOR, ETIQUETAS_TIPO, type TipoProveedor } from "./tipos";
import { TipoSelect } from "./tipo-select";
import { CorreoInput } from "./correo-input";

const filtros: { value: string; label: string }[] = [
  { value: "todos", label: "Todos" },
  ...TIPOS_PROVEEDOR.map((t) => ({ value: t, label: ETIQUETAS_TIPO[t] })),
  { value: "sin-clasificar", label: "Sin clasificar" },
];

type ProveedorRow = {
  id: string;
  rut: string;
  razon_social: string | null;
  tipo: TipoProveedor | null;
  correo: string | null;
};

export default async function ProveedoresPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string }>;
}) {
  const { tipo } = await searchParams;
  const filtroActivo = filtros.some((f) => f.value === tipo)
    ? (tipo as string)
    : "todos";

  const supabase = await createClient();

  let query = supabase
    .from("proveedores")
    .select("id, rut, razon_social, tipo, correo")
    .order("razon_social", { ascending: true, nullsFirst: false });

  if (filtroActivo === "sin-clasificar") {
    query = query.is("tipo", null);
  } else if (filtroActivo !== "todos") {
    query = query.eq("tipo", filtroActivo);
  }

  const [{ data, error }, { data: comprasData }] = await Promise.all([
    query,
    supabase.from("compras_sii").select("rut_proveedor, monto_total"),
  ]);

  const proveedores = (data ?? []) as ProveedorRow[];

  // Agrega cantidad de facturas y monto total por RUT (pocas filas, en memoria).
  const resumen = new Map<string, { n: number; monto: number }>();
  for (const c of comprasData ?? []) {
    const r = resumen.get(c.rut_proveedor) ?? { n: 0, monto: 0 };
    r.n += 1;
    r.monto += c.monto_total ?? 0;
    resumen.set(c.rut_proveedor, r);
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Proveedores</h1>
          <p className="mt-1 text-sm text-slate-500">
            Generados desde las compras del SII. Asigna un tipo a cada uno para
            filtrarlos.
          </p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {filtros.map((filtro) => (
          <Link
            key={filtro.value}
            href={
              filtro.value === "todos"
                ? "/proveedores"
                : `/proveedores?tipo=${filtro.value}`
            }
            className={
              filtroActivo === filtro.value
                ? "rounded-full bg-brand-600 px-3 py-1 text-sm font-medium text-white"
                : "rounded-full border border-slate-300 bg-white px-3 py-1 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
            }
          >
            {filtro.label}
          </Link>
        ))}
      </div>

      {error ? (
        <p className="text-sm text-red-600">
          No se pudieron cargar los proveedores. Intenta nuevamente.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Proveedor</th>
                <th className="px-4 py-3">RUT</th>
                <th className="px-4 py-3 text-right">Facturas</th>
                <th className="px-4 py-3 text-right">Total comprado</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Correo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {proveedores.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    {filtroActivo !== "todos"
                      ? "No hay proveedores con este tipo."
                      : "Aún no hay proveedores. Se generan al actualizar las compras."}
                  </td>
                </tr>
              ) : (
                proveedores.map((p) => {
                  const r = resumen.get(p.rut);
                  return (
                    <tr key={p.id} className="text-slate-700">
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {p.razon_social ?? "—"}
                      </td>
                      <td className="px-4 py-3">{p.rut}</td>
                      <td className="px-4 py-3 text-right">{r?.n ?? 0}</td>
                      <td className="px-4 py-3 text-right font-medium text-slate-900">
                        {formatCLP(r?.monto ?? 0)}
                      </td>
                      <td className="px-4 py-3">
                        <TipoSelect proveedorId={p.id} tipo={p.tipo} />
                      </td>
                      <td className="px-4 py-3">
                        <CorreoInput proveedorId={p.id} correo={p.correo} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
