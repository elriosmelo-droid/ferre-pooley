import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { normalizarRut } from "@/lib/rut";
import { formatCLP } from "@/lib/money";
import {
  construirEstadoCuenta,
  type VentaSiiEstadoCuenta,
  type NotaEstadoCuenta,
} from "@/lib/estado-cuenta";
import { EstadoPagoBadge } from "../estado-pago-badge";

function fmtFecha(iso: string | null) {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}-${m}-${a}`;
}

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
      .select("id, tipo_doc, rut_cliente, folio, fecha_emision, monto_total")
      .eq("rut_cliente", rutSii),
    supabase
      .from("notas_venta")
      .select("venta_sii_id, estado")
      .eq("cliente_id", cliente.id),
  ]);

  const { filas, totales } = construirEstadoCuenta(
    cliente.rut,
    (ventas ?? []) as VentaSiiEstadoCuenta[],
    (notas ?? []) as NotaEstadoCuenta[]
  );

  const saldoAFavor = totales.saldo < 0;

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

      {/* Totales */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tarjeta titulo="Facturado" valor={formatCLP(totales.facturado)} />
        <Tarjeta titulo="Notas de crédito" valor={`− ${formatCLP(totales.creditos)}`} />
        <Tarjeta titulo="Pagado" valor={`− ${formatCLP(totales.pagado)}`} />
        <Tarjeta
          titulo={saldoAFavor ? "Saldo a favor" : "Saldo pendiente"}
          valor={formatCLP(Math.abs(totales.saldo))}
          destacado
          verde={saldoAFavor || totales.saldo === 0}
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Folio</th>
              <th className="px-4 py-3 text-right">Monto</th>
              <th className="px-4 py-3">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filas.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  Este cliente no tiene documentos del SII.
                </td>
              </tr>
            ) : (
              filas.map((f) => (
                <tr key={f.id} className="text-slate-700">
                  <td className="px-4 py-3">{fmtFecha(f.fecha)}</td>
                  <td className="px-4 py-3">{f.tipoLabel}</td>
                  <td className="px-4 py-3">{f.folio}</td>
                  <td
                    className={`px-4 py-3 text-right font-medium ${
                      f.esCredito ? "text-red-600" : "text-slate-900"
                    }`}
                  >
                    {f.esCredito ? "− " : ""}
                    {formatCLP(f.monto)}
                  </td>
                  <td className="px-4 py-3">
                    <EstadoPagoBadge estado={f.estadoPago} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Tarjeta({
  titulo,
  valor,
  destacado,
  verde,
}: {
  titulo: string;
  valor: string;
  destacado?: boolean;
  verde?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        destacado
          ? verde
            ? "border-green-200 bg-green-50"
            : "border-amber-200 bg-amber-50"
          : "border-slate-200 bg-white"
      }`}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {titulo}
      </p>
      <p
        className={`mt-1 text-lg font-bold ${
          destacado ? (verde ? "text-green-700" : "text-amber-700") : "text-slate-900"
        }`}
      >
        {valor}
      </p>
    </div>
  );
}
