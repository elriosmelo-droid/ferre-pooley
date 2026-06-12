import { createAdminClient } from "@/lib/supabase/admin";
import { formatCLP } from "@/lib/money";
import { ResponderBotones } from "./responder-botones";

export const dynamic = "force-dynamic";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ItemRow = {
  sku: string;
  descripcion: string;
  cantidad: number;
  precio: number;
  posicion: number;
};

type CotizacionPublica = {
  folio: string;
  estado: string;
  fecha_validez: string;
  flete: number;
  subtotal_neto: number;
  iva: number;
  total: number;
  notas: string | null;
  created_at: string;
  clientes: { nombre: string } | null;
  cotizacion_items: ItemRow[];
};

function formatFecha(value: string) {
  const [anio, mes, dia] = value.slice(0, 10).split("-");
  return `${dia}-${mes}-${anio}`;
}

function hoySantiago(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
  }).format(new Date());
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-2xl">{children}</div>
    </main>
  );
}

function MensajeCard({
  icono,
  titulo,
  children,
}: {
  icono?: React.ReactNode;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <Shell>
      <div className="rounded-xl border border-slate-200 bg-white p-10 text-center shadow-sm">
        {icono}
        <h1 className="text-xl font-bold text-slate-900">{titulo}</h1>
        <div className="mt-2 text-sm text-slate-600">{children}</div>
      </div>
    </Shell>
  );
}

function NoEncontrada() {
  return (
    <MensajeCard titulo="Cotización no encontrada">
      <p>El enlace no es válido o la cotización ya no está disponible.</p>
    </MensajeCard>
  );
}

function Vencida({ folio, fecha }: { folio: string; fecha: string }) {
  return (
    <MensajeCard titulo="Cotización vencida">
      <p className="font-medium text-slate-700">{folio}</p>
      <p className="mt-1">
        Esta cotización venció el {formatFecha(fecha)}. Contáctanos para una
        nueva.
      </p>
    </MensajeCard>
  );
}

function Aceptada({ folio }: { folio: string }) {
  return (
    <MensajeCard
      icono={
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
          <svg
            className="h-7 w-7 text-green-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
      }
      titulo="Cotización aceptada"
    >
      <p className="font-medium text-slate-700">{folio}</p>
      <p className="mt-1">Gracias por su confirmación.</p>
    </MensajeCard>
  );
}

function Rechazada({ folio }: { folio: string }) {
  return (
    <MensajeCard titulo="Cotización rechazada">
      <p className="font-medium text-slate-700">{folio}</p>
    </MensajeCard>
  );
}

export default async function CotizacionPublicaPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  if (!UUID_REGEX.test(token)) {
    return <NoEncontrada />;
  }

  const supabase = createAdminClient();

  const { data } = await supabase
    .from("cotizaciones")
    .select(
      `folio, estado, fecha_validez, flete, subtotal_neto, iva, total, notas,
       created_at, clientes(nombre),
       cotizacion_items(sku, descripcion, cantidad, precio, posicion)`
    )
    .eq("token_aceptacion", token)
    .maybeSingle();

  if (!data) {
    return <NoEncontrada />;
  }

  const cotizacion = data as unknown as CotizacionPublica;

  if (cotizacion.estado === "borrador") {
    return <NoEncontrada />;
  }
  if (cotizacion.estado === "aceptada") {
    return <Aceptada folio={cotizacion.folio} />;
  }
  if (cotizacion.estado === "rechazada") {
    return <Rechazada folio={cotizacion.folio} />;
  }
  if (
    cotizacion.estado === "vencida" ||
    (cotizacion.estado === "enviada" && cotizacion.fecha_validez < hoySantiago())
  ) {
    return <Vencida folio={cotizacion.folio} fecha={cotizacion.fecha_validez} />;
  }
  if (cotizacion.estado !== "enviada") {
    return <NoEncontrada />;
  }

  const { data: perfil } = await supabase
    .from("perfiles")
    .select("razon_social")
    .limit(1)
    .maybeSingle();

  const empresa = perfil?.razon_social || "Ferre Pooley";
  const items = [...cotizacion.cotizacion_items].sort(
    (a, b) => a.posicion - b.posicion
  );

  return (
    <Shell>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-900 px-6 py-5 sm:px-8">
          <p className="text-lg font-bold text-white">{empresa}</p>
          <p className="text-sm text-slate-300">Cotización {cotizacion.folio}</p>
        </div>

        <div className="flex flex-col gap-6 px-6 py-6 sm:px-8">
          <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Cliente
              </p>
              <p className="mt-1 font-medium text-slate-900">
                {cotizacion.clientes?.nombre ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Fecha emisión
              </p>
              <p className="mt-1 text-slate-700">
                {formatFecha(cotizacion.created_at)}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Válida hasta
              </p>
              <p className="mt-1 text-slate-700">
                {formatFecha(cotizacion.fecha_validez)}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3">Descripción</th>
                  <th className="px-4 py-3 text-right">Cantidad</th>
                  <th className="px-4 py-3 text-right">Precio unit.</th>
                  <th className="px-4 py-3 text-right">Total línea</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item, i) => (
                  <tr key={i} className="text-slate-700">
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
                ))}
              </tbody>
            </table>
          </div>

          <dl className="ml-auto flex w-full max-w-xs flex-col gap-2 text-sm">
            <div className="flex justify-between text-slate-600">
              <dt>Subtotal neto</dt>
              <dd>{formatCLP(cotizacion.subtotal_neto)}</dd>
            </div>
            <div className="flex justify-between text-slate-600">
              <dt>Flete</dt>
              <dd>{formatCLP(cotizacion.flete)}</dd>
            </div>
            <div className="flex justify-between text-slate-600">
              <dt>IVA (19%)</dt>
              <dd>{formatCLP(cotizacion.iva)}</dd>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold text-slate-900">
              <dt>TOTAL</dt>
              <dd>{formatCLP(cotizacion.total)}</dd>
            </div>
          </dl>

          {cotizacion.notas && (
            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Notas
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                {cotizacion.notas}
              </p>
            </div>
          )}

          <ResponderBotones token={token} />
        </div>
      </div>
    </Shell>
  );
}
