"use server";

import { revalidatePath } from "next/cache";
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
