"use server";

import { randomUUID } from "node:crypto";
import { SIN_PERMISO, checkPermiso, getPerfilActual } from "@/lib/auth/rol";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  BUCKET_ADJUNTOS,
  BUCKET_IMAGENES,
  MAX_ADJUNTOS_BYTES,
  MAX_IMAGEN_BYTES,
  nombreSeguro,
} from "@/lib/email/adjuntos";

const IMAGENES_OK = ["image/png", "image/jpeg", "image/gif", "image/webp"];

export type SubidaFirmada =
  | {
      ok: true;
      bucket: string;
      ruta: string;
      token: string;
      // Solo para imágenes del cuerpo: URL pública que va en el HTML.
      urlPublica?: string;
    }
  | { ok: false; error: string };

// Los buckets se crean la primera vez que se usan, así no hay un paso manual
// de infraestructura aparte de la migración.
const listos = new Set<string>();
async function asegurarBucket(nombre: string, publico: boolean) {
  if (listos.has(nombre)) return;
  const admin = createAdminClient();
  const { data } = await admin.storage.getBucket(nombre);
  if (!data) {
    const { error } = await admin.storage.createBucket(nombre, { public: publico });
    // Dos subidas simultáneas pueden pelear por crearlo: "ya existe" no es error.
    if (error && !/already exists|duplicate/i.test(error.message)) {
      throw new Error(error.message);
    }
  }
  listos.add(nombre);
}

// Genera una URL de subida firmada para que el navegador suba el archivo
// directo a Storage. No pasa por la función de Vercel, que rechaza cuerpos de
// más de 4,5 MB. La ruta queda bajo la carpeta del usuario: al enviar solo se
// aceptan rutas propias.
export async function crearSubida(
  tipo: "adjunto" | "imagen",
  archivo: { filename: string; size: number; content_type: string }
): Promise<SubidaFirmada> {
  if (!(await checkPermiso("correos", "escritura"))) {
    return { ok: false, error: SIN_PERMISO };
  }
  const perfil = await getPerfilActual();
  if (!perfil) return { ok: false, error: SIN_PERMISO };

  if (!(archivo.size > 0)) return { ok: false, error: "El archivo está vacío." };

  const esImagen = tipo === "imagen";
  if (esImagen) {
    if (!IMAGENES_OK.includes(archivo.content_type)) {
      return { ok: false, error: "Solo se aceptan imágenes PNG, JPG, GIF o WebP." };
    }
    if (archivo.size > MAX_IMAGEN_BYTES) {
      return { ok: false, error: "La imagen supera los 8 MB." };
    }
  } else if (archivo.size > MAX_ADJUNTOS_BYTES) {
    return { ok: false, error: "El archivo supera los 25 MB." };
  }

  const bucket = esImagen ? BUCKET_IMAGENES : BUCKET_ADJUNTOS;
  try {
    await asegurarBucket(bucket, esImagen);
    const admin = createAdminClient();
    const ruta = `${perfil.userId}/${randomUUID()}/${nombreSeguro(archivo.filename)}`;
    const { data, error } = await admin.storage
      .from(bucket)
      .createSignedUploadUrl(ruta);
    if (error || !data) {
      return { ok: false, error: "No se pudo preparar la subida." };
    }
    return {
      ok: true,
      bucket,
      ruta,
      token: data.token,
      urlPublica: esImagen
        ? admin.storage.from(bucket).getPublicUrl(ruta).data.publicUrl
        : undefined,
    };
  } catch (e) {
    console.error("Error al preparar subida de correo:", e);
    return { ok: false, error: "No se pudo preparar la subida." };
  }
}
