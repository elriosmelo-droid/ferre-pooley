import { z } from "zod";

const emailSchema = z.email();

export type Destinatarios = { validos: string[]; invalidos: string[] };

// Separa un texto con varios destinatarios (coma, punto y coma, espacios o
// saltos de línea). Acepta "Nombre <correo@x.cl>" y se queda con el correo.
// Sin duplicados (sin distinguir mayúsculas) y conserva el orden.
export function parseDestinatarios(texto: string): Destinatarios {
  const validos: string[] = [];
  const invalidos: string[] = [];
  const vistos = new Set<string>();
  const partes = texto
    .split(/[,;\n]+/)
    .flatMap((p) => (p.includes("<") ? [p] : p.split(/\s+/)))
    .map((p) => p.trim())
    .filter(Boolean);
  for (const parte of partes) {
    const correo = (parte.match(/<([^>]+)>/)?.[1] ?? parte).trim();
    if (!emailSchema.safeParse(correo).success) {
      invalidos.push(parte);
      continue;
    }
    const clave = correo.toLowerCase();
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    validos.push(correo);
  }
  return { validos, invalidos };
}
