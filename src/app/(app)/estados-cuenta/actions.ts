"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type SetVencimientoResult = { error?: string; success?: boolean };

// Fija (o limpia con "") el vencimiento manual de una factura del SII. Sirve
// para darle más días a un cliente desde el estado de cuenta. Vacío → vuelve al
// vencimiento calculado.
export async function setVencimientoManual(
  ventaId: string,
  fecha: string
): Promise<SetVencimientoResult> {
  const limpio = fecha.trim();
  if (limpio !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(limpio)) {
    return { error: "Fecha inválida" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ventas_sii")
    .update({ fecha_vencimiento_manual: limpio || null })
    .eq("id", ventaId)
    .select("id");

  if (error) {
    console.error("Error al fijar vencimiento manual:", error.message);
    return { error: "No se pudo guardar el vencimiento. Intenta nuevamente." };
  }
  if (!data?.length) {
    return { error: "El documento ya no existe" };
  }

  revalidatePath("/estados-cuenta", "layout");
  revalidatePath("/ventas");
  return { success: true };
}
