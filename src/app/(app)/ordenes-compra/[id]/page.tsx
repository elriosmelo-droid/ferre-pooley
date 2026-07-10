import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatCLP } from "@/lib/money";
import { marcarRecibida } from "../actions";
import { EstadoBadge, type OrdenCompraEstado } from "../estado-badge";
import { EnviarButton } from "./enviar-button";
import { CerrarOrdenButton } from "./cerrar-orden-button";

type ItemRow = {
  id: string;
  sku: string;
  descripcion: string;
  cantidad: number;
  precio: number;
  posicion: number;
};

type OrdenDetalle = {
  id: string;
  folio: string;
  estado: OrdenCompraEstado;
  comprador: string | null;
  subtotal_neto: number;
  iva: number;
  total: number;
  notas: string | null;
  observacion_cierre: string | null;
  enviada_at: string | null;
  recibida_at: string | null;
  cerrada_at: string | null;
  created_at: string;
  proveedores: {
    razon_social: string | null;
    rut: string;
    correo: string | null;
  } | null;
  orden_compra_items: ItemRow[];
};

function formatFechaHora(value: string) {
  return new Date(value).toLocaleDateString("es-CL", {
    timeZone: "America/Santiago",
  });
}

export default async function DetalleOrdenCompraPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .from("ordenes_compra")
    .select(
      `id, folio, estado, comprador, subtotal_neto, iva, total, notas,
       observacion_cierre, enviada_at, recibida_at, cerrada_at, created_at,
       proveedores(razon_social, rut, correo),
       orden_compra_items(id, sku, descripcion, cantidad, precio, posicion)`
    )
    .eq("id", id)
    .single();

  if (!data) {
    notFound();
  }

  const orden = data as unknown as OrdenDetalle;
  const items = [...orden.orden_compra_items].sort(
    (a, b) => a.posicion - b.posicion
  );
  const proveedor = orden.proveedores;
  const recibir = marcarRecibida.bind(null, orden.id);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900">{orden.folio}</h1>
          <EstadoBadge estado={orden.estado} />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <a
            href={`/ordenes-compra/${orden.id}/pdf`}
            target="_blank"
            rel="noopener"
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            Ver PDF
          </a>
          {orden.estado === "borrador" && (
            <>
              <Link
                href={`/ordenes-compra/${orden.id}/editar`}
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                Editar
              </Link>
              <EnviarButton ordenId={orden.id} />
            </>
          )}
          {orden.estado === "enviada" && (
            <form action={recibir}>
              <button
                type="submit"
                className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
              >
                Marcar recibida
              </button>
            </form>
          )}
          {orden.estado === "recibida" && (
            <CerrarOrdenButton ordenId={orden.id} />
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Proveedor
          </h2>
          {proveedor ? (
            <dl className="flex flex-col gap-1 text-sm text-slate-700">
              <dd className="font-medium text-slate-900">
                {proveedor.razon_social ?? proveedor.rut}
              </dd>
              <dd>RUT: {proveedor.rut}</dd>
              {proveedor.correo ? (
                <dd>{proveedor.correo}</dd>
              ) : (
                <dd className="text-amber-600">Sin correo cargado</dd>
              )}
            </dl>
          ) : (
            <p className="text-sm text-slate-500">Proveedor no disponible.</p>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Fechas
          </h2>
          <dl className="flex flex-col gap-1 text-sm text-slate-700">
            {orden.comprador && (
              <div className="flex justify-between">
                <dt>Comprador</dt>
                <dd className="font-medium text-slate-900">{orden.comprador}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt>Creada</dt>
              <dd>{formatFechaHora(orden.created_at)}</dd>
            </div>
            {orden.enviada_at && (
              <div className="flex justify-between">
                <dt>Enviada</dt>
                <dd>{formatFechaHora(orden.enviada_at)}</dd>
              </div>
            )}
            {orden.recibida_at && (
              <div className="flex justify-between">
                <dt>Recibida</dt>
                <dd>{formatFechaHora(orden.recibida_at)}</dd>
              </div>
            )}
            {orden.cerrada_at && (
              <div className="flex justify-between">
                <dt>Cerrada</dt>
                <dd>{formatFechaHora(orden.cerrada_at)}</dd>
              </div>
            )}
          </dl>
          {orden.observacion_cierre && (
            <div className="mt-4 border-t border-slate-100 pt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Observación de cierre
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                {orden.observacion_cierre}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">SKU</th>
              <th className="px-4 py-3">Descripción</th>
              <th className="px-4 py-3 text-right">Cantidad</th>
              <th className="px-4 py-3 text-right">Precio compra</th>
              <th className="px-4 py-3 text-right">Total línea</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  Esta orden no tiene ítems.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="text-slate-700">
                  <td className="px-4 py-3">{item.sku || "—"}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {item.descripcion}
                  </td>
                  <td className="px-4 py-3 text-right">{item.cantidad}</td>
                  <td className="px-4 py-3 text-right">
                    {formatCLP(item.precio)}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-slate-900">
                    {formatCLP(item.cantidad * item.precio)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="ml-auto w-full max-w-xs rounded-xl border border-slate-200 bg-white p-4 text-sm">
        <dl className="flex flex-col gap-2">
          <div className="flex justify-between text-slate-600">
            <dt>Subtotal neto</dt>
            <dd>{formatCLP(orden.subtotal_neto)}</dd>
          </div>
          <div className="flex justify-between text-slate-600">
            <dt>IVA (19%)</dt>
            <dd>{formatCLP(orden.iva)}</dd>
          </div>
          <div className="flex justify-between border-t border-slate-200 pt-2 font-semibold text-slate-900">
            <dt>Total</dt>
            <dd>{formatCLP(orden.total)}</dd>
          </div>
        </dl>
      </div>

      {orden.notas && (
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Notas
          </h2>
          <p className="whitespace-pre-wrap text-sm text-slate-700">
            {orden.notas}
          </p>
        </div>
      )}
    </div>
  );
}
