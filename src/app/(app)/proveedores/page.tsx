import { createClient } from "@/lib/supabase/server";
import { type TipoProveedor } from "./tipos";
import { ProveedoresTabla, type ProveedorRow } from "./proveedores-tabla";
import { NuevoProveedor } from "./nuevo-proveedor";

type ProveedorDB = {
  id: string;
  rut: string;
  razon_social: string | null;
  tipo: TipoProveedor | null;
  correo: string | null;
};

export default async function ProveedoresPage() {
  const supabase = await createClient();

  const [{ data, error }, { data: comprasData }] = await Promise.all([
    supabase
      .from("proveedores")
      .select("id, rut, razon_social, tipo, correo")
      .order("razon_social", { ascending: true, nullsFirst: false }),
    supabase.from("compras_sii").select("rut_proveedor, monto_total"),
  ]);

  const proveedoresDB = (data ?? []) as ProveedorDB[];

  // Agrega cantidad de facturas y monto total por RUT (pocas filas, en memoria).
  const resumen = new Map<string, { n: number; monto: number }>();
  for (const c of comprasData ?? []) {
    const r = resumen.get(c.rut_proveedor) ?? { n: 0, monto: 0 };
    r.n += 1;
    r.monto += c.monto_total ?? 0;
    resumen.set(c.rut_proveedor, r);
  }

  const proveedores: ProveedorRow[] = proveedoresDB.map((p) => {
    const r = resumen.get(p.rut);
    return {
      ...p,
      facturas: r?.n ?? 0,
      total_comprado: r?.monto ?? 0,
    };
  });

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Proveedores</h1>
          <p className="mt-1 text-sm text-slate-500">
            Generados desde las compras del SII o creados a mano. Asigna un tipo
            a cada uno para filtrarlos.
          </p>
        </div>
        <NuevoProveedor />
      </div>

      {error ? (
        <p className="text-sm text-red-600">
          No se pudieron cargar los proveedores. Intenta nuevamente.
        </p>
      ) : (
        <ProveedoresTabla proveedores={proveedores} />
      )}
    </div>
  );
}
