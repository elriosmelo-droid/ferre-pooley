"use server";

import { revalidatePath } from "next/cache";
import { sincronizarVentas } from "@/lib/sii/sync";
import { precachearVencimientos } from "@/lib/sii/precache-vencimientos";

export type ActualizarVentasResult = {
  error?: string;
  encontradas?: number;
  guardadas?: number;
  vinculadas?: number;
  vencimientos?: number;
};

// Dispara el sync de ventas a demanda desde el botón "Actualizar ventas". La
// sesión la valida el middleware; misma lógica idempotente que el cron. Tras el
// sync, completa plazos/vencimientos (acotado; si algo queda, se retoma al
// volver a actualizar o en el cron).
export async function actualizarVentas(): Promise<ActualizarVentasResult> {
  try {
    const { encontradas, guardadas, vinculadas } = await sincronizarVentas();

    let vencimientos = 0;
    try {
      const venc = await precachearVencimientos();
      vencimientos = venc.conVencimiento;
    } catch (e) {
      console.error("Precache de vencimientos al actualizar ventas falló:", e);
    }

    revalidatePath("/ventas");
    revalidatePath("/notas-venta");
    return { encontradas, guardadas, vinculadas, vencimientos };
  } catch (err) {
    console.error("Error al actualizar ventas del SII:", err);
    const msg =
      err instanceof Error ? err.message : "No se pudieron actualizar las ventas.";
    return { error: msg };
  }
}
