import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { normalizarRut } from "@/lib/rut";
import {
  construirEstadoCuenta,
  type VentaSiiEstadoCuenta,
  type NotaEstadoCuenta,
} from "@/lib/estado-cuenta";
import { EstadoCuentaTabla } from "../estado-cuenta-tabla";

export default async function EstadoCuentaClientePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: cliente } = await supabase
    .from("clientes")
    .select("id, nombre, rut")
    .eq("id", id)
    .maybeSingle();

  if (!cliente) notFound();

  // RUT en formato SII (cuerpo-dv) para acotar la consulta; la lógica re-filtra
  // por RUT normalizado igual, así que tolera formatos distintos.
  const norm = normalizarRut(cliente.rut);
  const rutSii = norm.length >= 2 ? `${norm.slice(0, -1)}-${norm.slice(-1)}` : norm;

  const [{ data: ventas }, { data: notas }] = await Promise.all([
    supabase
      .from("ventas_sii")
      .select(
        "id, tipo_doc, rut_cliente, folio, fecha_emision, monto_total, forma_pago, term_pago_dias, fecha_vencimiento, fecha_vencimiento_manual"
      )
      .eq("rut_cliente", rutSii),
    supabase
      .from("notas_venta")
      .select("venta_sii_id, estado")
      .eq("cliente_id", cliente.id),
  ]);

  const hoy = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Santiago",
  });
  const { filas } = construirEstadoCuenta(
    cliente.rut,
    (ventas ?? []) as VentaSiiEstadoCuenta[],
    (notas ?? []) as NotaEstadoCuenta[],
    hoy
  );

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/estados-cuenta"
            className="text-sm text-slate-500 hover:text-slate-700"
          >
            ← Estados de cuenta
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            {cliente.nombre}
          </h1>
          <p className="text-sm text-slate-500">{cliente.rut ?? "sin RUT"}</p>
        </div>
        <a
          href={`/estados-cuenta/${cliente.id}/pdf`}
          target="_blank"
          rel="noopener"
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
        >
          Descargar PDF
        </a>
      </div>

      <EstadoCuentaTabla filas={filas} />
    </div>
  );
}
