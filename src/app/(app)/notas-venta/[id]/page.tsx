import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatCLP } from "@/lib/money";
import { NotaEstadoBadge, type NotaVentaEstado } from "../nota-estado-badge";
import { AccionesNota } from "./acciones-nota";

type ItemRow = {
  id: string;
  sku: string;
  descripcion: string;
  cantidad: number;
  costo: number;
  precio: number;
  flete: number;
  posicion: number;
};

type NotaVentaDetalle = {
  id: string;
  folio: string;
  estado: NotaVentaEstado;
  flete: number;
  subtotal_neto: number;
  iva: number;
  total: number;
  pagada_at: string | null;
  created_at: string;
  clientes: {
    nombre: string;
    rut: string | null;
    correo: string;
  } | null;
  cotizaciones: {
    id: string;
    folio: string;
    firma: string | null;
    firmante: string | null;
  } | null;
  nota_venta_items: ItemRow[];
};

function formatFechaHora(value: string) {
  return new Date(value).toLocaleDateString("es-CL", {
    timeZone: "America/Santiago",
  });
}

export default async function DetalleNotaVentaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("notas_venta")
    .select(
      `id, folio, estado, flete, subtotal_neto, iva, total, pagada_at, created_at,
       clientes(nombre, rut, correo),
       cotizaciones(id, folio, firma, firmante),
       nota_venta_items(id, sku, descripcion, cantidad, costo, precio, flete, posicion)`
    )
    .eq("id", id)
    .single();

  // PGRST116 = sin filas: eso sí es un 404. Otros errores son fallas de DB.
  if (error && error.code !== "PGRST116") {
    throw new Error("No se pudo cargar la nota de venta.");
  }
  if (!data) {
    notFound();
  }

  const nota = data as unknown as NotaVentaDetalle;
  const items = [...nota.nota_venta_items].sort(
    (a, b) => a.posicion - b.posicion
  );
  const cliente = nota.clientes;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900">{nota.folio}</h1>
          <NotaEstadoBadge estado={nota.estado} />
        </div>
        {nota.estado === "pendiente" && (
          <AccionesNota notaVentaId={nota.id} />
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Cliente
          </h2>
          {cliente ? (
            <dl className="flex flex-col gap-1 text-sm text-slate-700">
              <dd className="font-medium text-slate-900">{cliente.nombre}</dd>
              {cliente.rut && <dd>RUT: {cliente.rut}</dd>}
              <dd>{cliente.correo}</dd>
            </dl>
          ) : (
            <p className="text-sm text-slate-500">Cliente no disponible.</p>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Origen
          </h2>
          <dl className="flex flex-col gap-1 text-sm text-slate-700">
            <div className="flex justify-between">
              <dt>Cotización</dt>
              <dd>
                {nota.cotizaciones ? (
                  <Link
                    href={`/cotizaciones/${nota.cotizaciones.id}`}
                    className="font-medium text-blue-600 hover:text-blue-800"
                  >
                    {nota.cotizaciones.folio}
                  </Link>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt>Creada</dt>
              <dd>{formatFechaHora(nota.created_at)}</dd>
            </div>
            {nota.pagada_at && (
              <div className="flex justify-between">
                <dt>Pagada</dt>
                <dd>{formatFechaHora(nota.pagada_at)}</dd>
              </div>
            )}
          </dl>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">SKU</th>
              <th className="px-4 py-3">Descripción</th>
              <th className="px-4 py-3 text-right">Cantidad</th>
              <th className="px-4 py-3 text-right text-amber-600">
                Costo (interno)
              </th>
              <th className="px-4 py-3 text-right">Precio</th>
              <th className="px-4 py-3 text-right text-amber-600">
                Flete unit. (interno)
              </th>
              <th className="px-4 py-3 text-right">Precio final</th>
              <th className="px-4 py-3 text-right">Total línea</th>
              <th className="px-4 py-3 text-right text-amber-600">
                Margen (interno)
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                  Esta nota de venta no tiene ítems.
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
                  <td className="px-4 py-3 text-right text-amber-600">
                    {formatCLP(item.costo)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {formatCLP(item.precio)}
                  </td>
                  <td className="px-4 py-3 text-right text-amber-600">
                    {formatCLP(item.flete)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {formatCLP(item.precio + item.flete)}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-slate-900">
                    {formatCLP(item.cantidad * (item.precio + item.flete))}
                  </td>
                  <td className="px-4 py-3 text-right text-amber-600">
                    {formatCLP(item.cantidad * (item.precio - item.costo))}
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
            <dd>{formatCLP(nota.subtotal_neto)}</dd>
          </div>
          <div className="flex justify-between text-slate-600">
            <dt>Flete</dt>
            <dd>{formatCLP(nota.flete)}</dd>
          </div>
          <div className="flex justify-between text-slate-600">
            <dt>IVA (19%)</dt>
            <dd>{formatCLP(nota.iva)}</dd>
          </div>
          <div className="flex justify-between border-t border-slate-200 pt-2 font-semibold text-slate-900">
            <dt>Total</dt>
            <dd>{formatCLP(nota.total)}</dd>
          </div>
        </dl>
      </div>

      {nota.cotizaciones?.firma && (
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Aceptación firmada por el cliente
          </h2>
          {nota.cotizaciones.firmante && (
            <p className="mb-2 text-sm text-slate-700">
              Firmado por:{" "}
              <span className="font-medium">{nota.cotizaciones.firmante}</span>
            </p>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={nota.cotizaciones.firma}
            alt="Firma del cliente"
            className="max-h-40 rounded-md border border-slate-200 bg-white"
          />
        </div>
      )}
    </div>
  );
}
