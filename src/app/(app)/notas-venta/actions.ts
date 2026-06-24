"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type NotaVentaActionResult = {
  error?: string;
  success?: boolean;
};

export async function marcarPagada(
  id: string
): Promise<NotaVentaActionResult> {
  const supabase = await createClient();

  // El .eq("estado") hace la transición atómica: si otra pestaña ya la
  // pagó o anuló, el update no afecta filas y se rechaza.
  const { data, error } = await supabase
    .from("notas_venta")
    .update({ estado: "pagada", pagada_at: new Date().toISOString() })
    .eq("id", id)
    .eq("estado", "pendiente")
    .select("id");

  if (error) {
    console.error("Error al marcar nota de venta como pagada:", error.message);
    return {
      error: "No se pudo marcar como pagada. Intenta nuevamente.",
    };
  }
  if (!data?.length) {
    return { error: "La nota de venta ya no está pendiente" };
  }

  revalidatePath("/notas-venta");
  revalidatePath(`/notas-venta/${id}`);
  return { success: true };
}

// Borrado definitivo: elimina la nota y, por FK on delete cascade, sus ítems.
// La cotización de origen queda intacta (estado "aceptada"); como su vínculo es
// único, no se podrá generar otra nota desde esa cotización.
export async function eliminarNotaVenta(
  id: string
): Promise<NotaVentaActionResult> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("notas_venta")
    .delete()
    .eq("id", id)
    .select("id");

  if (error) {
    console.error("Error al eliminar nota de venta:", error.message);
    return {
      error: "No se pudo eliminar la nota de venta. Intenta nuevamente.",
    };
  }
  if (!data?.length) {
    return { error: "La nota de venta ya no existe" };
  }

  revalidatePath("/notas-venta");
  redirect("/notas-venta");
}

// Adjunta una factura del SII a una nota de venta. El vínculo vive en
// ventas_sii.nota_venta_id (una nota agrupa varias facturas). El `is null`
// evita robar una factura ya asignada a otra nota.
export async function vincularFacturaVenta(
  notaId: string,
  ventaSiiId: string
): Promise<NotaVentaActionResult> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("ventas_sii")
    .update({ nota_venta_id: notaId })
    .eq("id", ventaSiiId)
    .is("nota_venta_id", null)
    .select("id");

  if (error) {
    console.error("Error al vincular factura del SII:", error.message);
    return { error: "No se pudo vincular la factura. Intenta nuevamente." };
  }
  if (!data?.length) {
    return { error: "Esa factura ya está vinculada a otra nota de venta." };
  }

  revalidatePath(`/notas-venta/${notaId}`);
  revalidatePath("/ventas");
  revalidatePath("/conciliacion");
  return { success: true };
}

// Quita una factura de su nota (se identifica por la factura, no por la nota,
// porque una nota puede tener varias).
export async function desvincularFacturaVenta(
  ventaSiiId: string
): Promise<NotaVentaActionResult> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("ventas_sii")
    .update({ nota_venta_id: null })
    .eq("id", ventaSiiId);

  if (error) {
    console.error("Error al desvincular factura del SII:", error.message);
    return { error: "No se pudo desvincular la factura. Intenta nuevamente." };
  }

  revalidatePath("/notas-venta");
  revalidatePath("/ventas");
  revalidatePath("/conciliacion");
  return { success: true };
}

export async function anularNotaVenta(
  id: string
): Promise<NotaVentaActionResult> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("notas_venta")
    .update({ estado: "anulada" })
    .eq("id", id)
    .eq("estado", "pendiente")
    .select("id");

  if (error) {
    console.error("Error al anular nota de venta:", error.message);
    return {
      error: "No se pudo anular la nota de venta. Intenta nuevamente.",
    };
  }
  if (!data?.length) {
    return { error: "Solo se pueden anular notas pendientes" };
  }

  revalidatePath("/notas-venta");
  revalidatePath(`/notas-venta/${id}`);
  return { success: true };
}
