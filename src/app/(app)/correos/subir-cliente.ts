"use client";

import { createClient } from "@/lib/supabase/client";
import { crearSubida } from "./subidas";

export type ArchivoSubido = {
  ruta: string;
  urlPublica?: string;
};

// Sube un archivo directo del navegador a Storage con una URL firmada por el
// servidor (que valida permiso, tipo y tamaño). Lanza Error con un mensaje
// listo para mostrar.
export async function subirArchivo(
  tipo: "adjunto" | "imagen",
  file: File
): Promise<ArchivoSubido> {
  const firma = await crearSubida(tipo, {
    filename: file.name,
    size: file.size,
    content_type: file.type || "application/octet-stream",
  });
  if (!firma.ok) throw new Error(firma.error);

  const { error } = await createClient()
    .storage.from(firma.bucket)
    .uploadToSignedUrl(firma.ruta, firma.token, file, {
      contentType: file.type || "application/octet-stream",
    });
  if (error) throw new Error("No se pudo subir el archivo. Intenta nuevamente.");
  return { ruta: firma.ruta, urlPublica: firma.urlPublica };
}
