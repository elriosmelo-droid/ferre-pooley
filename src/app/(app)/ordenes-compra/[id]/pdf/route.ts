import { createClient } from "@/lib/supabase/server";
import { getPerfilActual } from "@/lib/auth/rol";
import { generarPdfOrdenCompra } from "@/lib/pdf/orden-compra-pdf";

export const maxDuration = 60;

// PDF de la orden de compra: el mismo documento que se le envía al proveedor por
// correo. La orden es inmutable una vez enviada, así que regenerarlo da un PDF
// idéntico al adjunto. Guardado por membresía (datos financieros).
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const perfil = await getPerfilActual();
  if (!perfil) return new Response("No autorizado", { status: 401 });

  const { id } = await params;
  const supabase = await createClient();

  const { data: orden, error } = await supabase
    .from("ordenes_compra")
    .select(
      `id, folio, comprador, subtotal_neto, iva, total, notas, created_at,
       proveedores(razon_social, rut, correo),
       orden_compra_items(sku, descripcion, cantidad, precio, posicion)`
    )
    .eq("id", id)
    .single();

  if (error || !orden) {
    return new Response("Orden no encontrada", { status: 404 });
  }

  const proveedor = orden.proveedores as unknown as {
    razon_social: string | null;
    rut: string;
    correo: string | null;
  } | null;

  if (!proveedor) {
    return new Response("La orden no tiene proveedor", { status: 422 });
  }

  const items = [
    ...(orden.orden_compra_items as unknown as {
      sku: string;
      descripcion: string;
      cantidad: number;
      precio: number;
      posicion: number;
    }[]),
  ].sort((a, b) => a.posicion - b.posicion);

  const pdf = await generarPdfOrdenCompra({
    orden: {
      folio: orden.folio,
      created_at: orden.created_at,
      comprador: orden.comprador as string | null,
      subtotal_neto: orden.subtotal_neto,
      iva: orden.iva,
      total: orden.total,
      notas: orden.notas,
    },
    items,
    proveedor: {
      razon_social: proveedor.razon_social,
      rut: proveedor.rut,
      correo: proveedor.correo,
    },
  });

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${orden.folio}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
