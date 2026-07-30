"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sincronizarCompras } from "@/lib/sii/sync";
import { precachearComprasPdf } from "@/lib/sii/precache-compras";
import {
  esFormaPagoCompra,
  normalizarFormasPago,
} from "@/lib/forma-pago-compra";

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

export type SetFormaPagoResult = { error?: string };

// Guarda las formas de pago de una compra (puede tener varias, ej. cheque +
// débito). Dato manual y opcional: arreglo vacío la deja en "sin asignar". No
// usa el service role: la RLS por membresía ya gatea el acceso.
export async function setFormasPagoCompra(
  id: string,
  valores: string[]
): Promise<SetFormaPagoResult> {
  const invalida = valores.find((v) => !esFormaPagoCompra(v));
  if (invalida !== undefined) {
    return { error: `Forma de pago no válida: ${invalida}` };
  }
  const formas = normalizarFormasPago(valores);

  const supabase = await createClient();
  const { error } = await supabase
    .from("compras_sii")
    .update({ forma_pago: formas.length === 0 ? null : formas })
    .eq("id", id);

  if (error) {
    console.error("Error al guardar formas de pago:", error.message);
    return { error: "No se pudo guardar la forma de pago." };
  }

  revalidatePath("/compras");
  return {};
}

export type GenerarPdfsResult = {
  error?: string;
  generados?: number;
  pendientes?: number;
  noDisponibles?: number;
  rateLimited?: boolean;
};

// Pre-genera los PDF de los DTE recibidos que aún no están cacheados, en una
// sola sesión al SII (el SII throttlea si se abre una por click). Luego "Ver"
// sirve del caché en Storage. Idempotente: lo que falte lo toma otra corrida.
export async function generarPdfsCompras(): Promise<GenerarPdfsResult> {
  try {
    const { generados, pendientes, noDisponibles, rateLimited } =
      await precachearComprasPdf();
    revalidatePath("/compras");
    return { generados, pendientes, noDisponibles, rateLimited };
  } catch (err) {
    console.error("Error al generar PDFs de compras:", err);
    const msg =
      err instanceof Error ? err.message : "No se pudieron generar los PDF.";
    return { error: msg };
  }
}
