export const BUCKET_ADJUNTOS = "correo-adjuntos"; // privado
export const BUCKET_IMAGENES = "correo-imagenes"; // público (fotos del cuerpo)

// Límite total de adjuntos por correo. Gmail usa 25 MB; Resend admite 40.
export const MAX_ADJUNTOS_BYTES = 25 * 1024 * 1024;
export const MAX_ADJUNTOS_CANTIDAD = 15;
// Una foto pegada en el cuerpo no pasa de esto (se sube a Storage público).
export const MAX_IMAGEN_BYTES = 8 * 1024 * 1024;

export type AdjuntoSubido = {
  id: string;
  filename: string;
  size: number;
  content_type: string;
  // Ruta dentro del bucket privado de adjuntos.
  ruta: string;
};

export function validarAdjuntos(
  lista: { filename: string; size: number }[]
): string | null {
  if (lista.length > MAX_ADJUNTOS_CANTIDAD) {
    return `Máximo ${MAX_ADJUNTOS_CANTIDAD} archivos por correo.`;
  }
  const total = lista.reduce((s, a) => s + a.size, 0);
  if (total > MAX_ADJUNTOS_BYTES) {
    return "Los adjuntos superan los 25 MB en total.";
  }
  if (lista.some((a) => a.size <= 0)) return "Hay un archivo vacío.";
  return null;
}

// Nombre apto para ruta de Storage: sin carpetas ni caracteres raros, pero
// conservando la extensión.
export function nombreSeguro(nombre: string): string {
  const limpio = nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^[._]+/, "")
    .slice(-120);
  return limpio || "archivo";
}

export function tamanoLegible(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
