import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { OrdenesCompraTabla, type OrdenCompraRow } from "./ordenes-compra-tabla";

export default async function OrdenesCompraPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("ordenes_compra")
    .select("id, folio, created_at, total, estado, proveedores(razon_social, rut)")
    .order("created_at", { ascending: false });

  const ordenes = (data ?? []) as unknown as OrdenCompraRow[];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Órdenes de compra</h1>
        <Link
          href="/ordenes-compra/nueva"
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
        >
          Nueva orden
        </Link>
      </div>

      {error ? (
        <p className="text-sm text-red-600">
          No se pudieron cargar las órdenes. Intenta nuevamente.
        </p>
      ) : (
        <OrdenesCompraTabla ordenes={ordenes} />
      )}
    </div>
  );
}
