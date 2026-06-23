import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatCLP } from "@/lib/money";
import { calcularTotales, descuentoUnitario } from "@/lib/totals";
import { etiquetasMedioPago } from "@/lib/medio-pago";
import { APP_URL } from "@/lib/app-url";
import { duplicarCotizacion } from "../actions";
import { EstadoBadge, type CotizacionEstado } from "../estado-badge";
import { CopiarLink } from "./copiar-link";
import { EnviarButton } from "./enviar-button";

type ItemRow = {
  id: string;
  sku: string;
  descripcion: string;
  cantidad: number;
  costo: number;
  precio: number;
  flete: number;
  descuento: number;
  posicion: number;
};

type CotizacionDetalle = {
  id: string;
  folio: string;
  estado: CotizacionEstado;
  fecha_validez: string;
  flete: number;
  medio_pago: string[] | null;
  vendedor: string | null;
  subtotal_neto: number;
  iva: number;
  total: number;
  token_aceptacion: string;
  notas: string | null;
  firma: string | null;
  firmante: string | null;
  motivo_rechazo: string | null;
  enviada_at: string | null;
  respondida_at: string | null;
  created_at: string;
  clientes: {
    nombre: string;
    rut: string | null;
    correo: string;
    telefono: string | null;
    direccion: string | null;
  } | null;
  cotizacion_items: ItemRow[];
};

function formatFecha(value: string) {
  const [anio, mes, dia] = value.slice(0, 10).split("-");
  return `${dia}-${mes}-${anio}`;
}

function formatFechaHora(value: string) {
  return new Date(value).toLocaleDateString("es-CL", {
    timeZone: "America/Santiago",
  });
}

export default async function DetalleCotizacionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .from("cotizaciones")
    .select(
      `id, folio, estado, fecha_validez, flete, medio_pago, vendedor, subtotal_neto, iva, total,
       token_aceptacion, notas, firma, firmante, motivo_rechazo, enviada_at, respondida_at, created_at,
       clientes(nombre, rut, correo, telefono, direccion),
       cotizacion_items(id, sku, descripcion, cantidad, costo, precio, flete, descuento, posicion)`
    )
    .eq("id", id)
    .single();

  if (!data) {
    notFound();
  }

  const cotizacion = data as unknown as CotizacionDetalle;
  const items = [...cotizacion.cotizacion_items].sort(
    (a, b) => a.posicion - b.posicion
  );
  const totales = calcularTotales(items);
  const cliente = cotizacion.clientes;
  const linkPublico = `${APP_URL}/cotizacion/${cotizacion.token_aceptacion}`;
  const mostrarLinkPublico = ["enviada", "aceptada", "rechazada"].includes(
    cotizacion.estado
  );
  const duplicar = duplicarCotizacion.bind(null, cotizacion.id);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900">
            {cotizacion.folio}
          </h1>
          <EstadoBadge estado={cotizacion.estado} />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {cotizacion.estado === "borrador" && (
            <>
              <Link
                href={`/cotizaciones/${cotizacion.id}/editar`}
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                Editar
              </Link>
              <EnviarButton cotizacionId={cotizacion.id} />
            </>
          )}
          <form action={duplicar}>
            <button
              type="submit"
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              Duplicar
            </button>
          </form>
        </div>
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
              {cliente.telefono && <dd>{cliente.telefono}</dd>}
              {cliente.direccion && <dd>{cliente.direccion}</dd>}
            </dl>
          ) : (
            <p className="text-sm text-slate-500">Cliente no disponible.</p>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Fechas
          </h2>
          <dl className="flex flex-col gap-1 text-sm text-slate-700">
            {cotizacion.vendedor && (
              <div className="flex justify-between">
                <dt>Vendedor</dt>
                <dd className="font-medium text-slate-900">
                  {cotizacion.vendedor}
                </dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt>Creada</dt>
              <dd>{formatFechaHora(cotizacion.created_at)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Válida hasta</dt>
              <dd>{formatFecha(cotizacion.fecha_validez)}</dd>
            </div>
            {cotizacion.enviada_at && (
              <div className="flex justify-between">
                <dt>Enviada</dt>
                <dd>{formatFechaHora(cotizacion.enviada_at)}</dd>
              </div>
            )}
            {cotizacion.respondida_at && (
              <div className="flex justify-between">
                <dt>Respondida</dt>
                <dd>{formatFechaHora(cotizacion.respondida_at)}</dd>
              </div>
            )}
          </dl>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[760px] text-left text-sm">
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
              <th className="px-4 py-3 text-right">Desc. %</th>
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
                <td colSpan={10} className="px-4 py-8 text-center text-slate-500">
                  Esta cotización no tiene ítems.
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
                    {item.descuento > 0 ? `${item.descuento}%` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {formatCLP(
                      item.precio -
                        descuentoUnitario(item.precio, item.descuento) +
                        item.flete
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-slate-900">
                    {formatCLP(
                      item.cantidad *
                        (item.precio -
                          descuentoUnitario(item.precio, item.descuento) +
                          item.flete)
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-amber-600">
                    {formatCLP(
                      item.cantidad *
                        (item.precio -
                          descuentoUnitario(item.precio, item.descuento) -
                          item.costo)
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="ml-auto w-full max-w-xs rounded-xl border border-slate-200 bg-white p-4 text-sm">
        <dl className="flex flex-col gap-2">
          <div className="flex justify-between gap-4 text-slate-600">
            <dt>Medios de pago</dt>
            <dd className="text-right font-medium text-slate-900">
              {etiquetasMedioPago(cotizacion.medio_pago)}
            </dd>
          </div>
          {totales.descuento > 0 && (
            <>
              <div className="flex justify-between border-t border-slate-200 pt-2 text-slate-600">
                <dt>Subtotal bruto</dt>
                <dd>{formatCLP(totales.subtotalBruto)}</dd>
              </div>
              <div className="flex justify-between text-slate-600">
                <dt>Descuento</dt>
                <dd>-{formatCLP(totales.descuento)}</dd>
              </div>
            </>
          )}
          <div className="flex justify-between text-slate-600">
            <dt>Subtotal neto</dt>
            <dd>{formatCLP(cotizacion.subtotal_neto)}</dd>
          </div>
          <div className="flex justify-between text-slate-600">
            <dt>IVA (19%)</dt>
            <dd>{formatCLP(cotizacion.iva)}</dd>
          </div>
          <div className="flex justify-between border-t border-slate-200 pt-2 font-semibold text-slate-900">
            <dt>Total</dt>
            <dd>{formatCLP(cotizacion.total)}</dd>
          </div>
        </dl>
      </div>

      {cotizacion.notas && (
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Notas
          </h2>
          <p className="whitespace-pre-wrap text-sm text-slate-700">
            {cotizacion.notas}
          </p>
        </div>
      )}

      {cotizacion.estado === "rechazada" && cotizacion.motivo_rechazo && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-red-700">
            Motivo del rechazo
          </h2>
          <p className="whitespace-pre-wrap text-sm text-slate-700">
            {cotizacion.motivo_rechazo}
          </p>
        </div>
      )}

      {cotizacion.firma && (
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Aceptación firmada
          </h2>
          {cotizacion.firmante && (
            <p className="mb-2 text-sm text-slate-700">
              Firmado por:{" "}
              <span className="font-medium">{cotizacion.firmante}</span>
              {cotizacion.respondida_at &&
                ` · ${formatFechaHora(cotizacion.respondida_at)}`}
            </p>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={cotizacion.firma}
            alt="Firma del cliente"
            className="max-h-40 rounded-md border border-slate-200 bg-white"
          />
        </div>
      )}

      {mostrarLinkPublico && (
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Link público
          </h2>
          <CopiarLink url={linkPublico} />
        </div>
      )}
    </div>
  );
}
