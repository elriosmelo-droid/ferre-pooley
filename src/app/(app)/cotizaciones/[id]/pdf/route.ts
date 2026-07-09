import { createClient } from "@/lib/supabase/server";
import { getPerfilActual } from "@/lib/auth/rol";
import { calcularTotales, descuentoUnitario } from "@/lib/totals";
import { generarPdfCotizacion } from "@/lib/pdf/cotizacion-pdf";

export const maxDuration = 60;

// PDF de la cotización: el mismo documento que se le envía al cliente por
// correo. Se regenera desde los datos actuales de la cotización. Guardado por
// membresía (datos comerciales).
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const perfil = await getPerfilActual();
  if (!perfil) return new Response("No autorizado", { status: 401 });

  const { id } = await params;
  const supabase = await createClient();

  const { data: cotizacion, error } = await supabase
    .from("cotizaciones")
    .select(
      `folio, created_at, fecha_validez, medio_pago, vendedor, subtotal_neto, iva, total, notas,
       clientes(nombre, rut, correo, telefono, direccion),
       cotizacion_items(sku, descripcion, cantidad, precio, flete, descuento, posicion)`
    )
    .eq("id", id)
    .single();

  if (error || !cotizacion) {
    return new Response("Cotización no encontrada", { status: 404 });
  }

  const cliente = cotizacion.clientes as unknown as {
    nombre: string;
    rut: string | null;
    correo: string;
    telefono: string | null;
    direccion: string | null;
  } | null;

  if (!cliente) {
    return new Response("La cotización no tiene cliente", { status: 422 });
  }

  const itemsRaw = [
    ...(cotizacion.cotizacion_items as unknown as {
      sku: string;
      descripcion: string;
      cantidad: number;
      precio: number;
      flete: number;
      descuento: number;
      posicion: number;
    }[]),
  ].sort((a, b) => a.posicion - b.posicion);

  // Igual que en el envío: el cliente ve el precio de lista (precio + flete) y,
  // si hay descuento, el precio rebajado.
  const items = itemsRaw.map((it) => {
    const precioLista = it.precio + it.flete;
    return {
      sku: it.sku,
      descripcion: it.descripcion,
      cantidad: it.cantidad,
      precio: precioLista,
      descuento: it.descuento,
      precioConDesc: precioLista - descuentoUnitario(it.precio, it.descuento),
    };
  });
  const totales = calcularTotales(itemsRaw);

  const pdf = await generarPdfCotizacion({
    cotizacion: {
      folio: cotizacion.folio,
      created_at: cotizacion.created_at,
      fecha_validez: cotizacion.fecha_validez,
      medio_pago: (cotizacion.medio_pago as string[] | null) ?? [],
      vendedor: cotizacion.vendedor as string | null,
      subtotal_bruto: totales.subtotalBruto,
      descuento: totales.descuento,
      subtotal_neto: cotizacion.subtotal_neto,
      iva: cotizacion.iva,
      total: cotizacion.total,
      notas: cotizacion.notas,
    },
    items,
    cliente,
  });

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${cotizacion.folio}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
