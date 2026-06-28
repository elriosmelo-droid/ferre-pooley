"use server";

import { revalidatePath } from "next/cache";
import { sincronizarCompras } from "@/lib/sii/sync";
import { precachearComprasPdf } from "@/lib/sii/precache-compras";

export type ActualizarComprasResult = {
  error?: string;
  encontradas?: number;
  guardadas?: number;
  pdfsGenerados?: number;
};

// Dispara el sync del SII a demanda desde el botón "Actualizar compras". La
// sesión la valida el middleware (la página vive bajo (app)); no usa el secret
// del cron. Es la misma lógica idempotente que corre cada hora.
export async function actualizarCompras(): Promise<ActualizarComprasResult> {
  try {
    const { encontradas, guardadas } = await sincronizarCompras();
    // Tras bajar las compras, trae también los detalles (PDF de cada DTE
    // recibido) en la misma sesión. Acotado porque el sync ya consumió tiempo;
    // lo que falte lo completa el botón "Generar PDFs" o la próxima corrida.
    let pdfsGenerados = 0;
    try {
      const pre = await precachearComprasPdf(15);
      pdfsGenerados = pre.generados;
    } catch (e) {
      console.error("Precache de PDFs tras actualizar compras falló:", e);
    }
    revalidatePath("/compras");
    return { encontradas, guardadas, pdfsGenerados };
  } catch (err) {
    console.error("Error al actualizar compras del SII:", err);
    const msg =
      err instanceof Error ? err.message : "No se pudieron actualizar las compras.";
    return { error: msg };
  }
}

export type GenerarPdfsResult = {
  error?: string;
  generados?: number;
  pendientes?: number;
  rateLimited?: boolean;
};

// Pre-genera los PDF de los DTE recibidos que aún no están cacheados, en una
// sola sesión al SII (el SII throttlea si se abre una por click). Luego "Ver"
// sirve del caché en Storage. Idempotente: lo que falte lo toma otra corrida.
export async function generarPdfsCompras(): Promise<GenerarPdfsResult> {
  try {
    const { generados, pendientes, rateLimited } = await precachearComprasPdf();
    revalidatePath("/compras");
    return { generados, pendientes, rateLimited };
  } catch (err) {
    console.error("Error al generar PDFs de compras:", err);
    const msg =
      err instanceof Error ? err.message : "No se pudieron generar los PDF.";
    return { error: msg };
  }
}
