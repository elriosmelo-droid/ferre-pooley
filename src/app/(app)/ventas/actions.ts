"use server";

import { revalidatePath } from "next/cache";
import { sincronizarVentas } from "@/lib/sii/sync";

export type ActualizarVentasResult = {
  error?: string;
  encontradas?: number;
  guardadas?: number;
  vinculadas?: number;
};

// Dispara el sync de ventas a demanda desde el botón "Actualizar ventas". La
// sesión la valida el middleware; misma lógica idempotente que el cron.
export async function actualizarVentas(): Promise<ActualizarVentasResult> {
  try {
    const { encontradas, guardadas, vinculadas } = await sincronizarVentas();
    revalidatePath("/ventas");
    revalidatePath("/notas-venta");
    return { encontradas, guardadas, vinculadas };
  } catch (err) {
    console.error("Error al actualizar ventas del SII:", err);
    const msg =
      err instanceof Error ? err.message : "No se pudieron actualizar las ventas.";
    return { error: msg };
  }
}
