"use server";

import { revalidatePath } from "next/cache";
import { sincronizarCompras } from "@/lib/sii/sync";

export type ActualizarComprasResult = {
  error?: string;
  encontradas?: number;
  guardadas?: number;
};

// Dispara el sync del SII a demanda desde el botón "Actualizar compras". La
// sesión la valida el middleware (la página vive bajo (app)); no usa el secret
// del cron. Es la misma lógica idempotente que corre cada hora.
export async function actualizarCompras(): Promise<ActualizarComprasResult> {
  try {
    const { encontradas, guardadas } = await sincronizarCompras();
    revalidatePath("/compras");
    return { encontradas, guardadas };
  } catch (err) {
    console.error("Error al actualizar compras del SII:", err);
    const msg =
      err instanceof Error ? err.message : "No se pudieron actualizar las compras.";
    return { error: msg };
  }
}
