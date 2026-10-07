// Firma por defecto y armado de respuestas/reenvíos.

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type DatosFirma = {
  nombre?: string | null;
  razonSocial?: string | null;
  telefono?: string | null;
  correo?: string | null;
  // URL absoluta y pública del logo (los clientes de correo no ven rutas
  // relativas).
  logoUrl: string;
};

export function firmaPorDefecto(d: DatosFirma): string {
  const lineas: string[] = [];
  if (d.nombre) lineas.push(`<strong>${esc(d.nombre)}</strong>`);
  if (d.razonSocial) lineas.push(esc(d.razonSocial));
  if (d.telefono) lineas.push(`Tel: ${esc(d.telefono)}`);
  if (d.correo) lineas.push(esc(d.correo));
  const texto = lineas.length
    ? `<p>${lineas.join("<br>")}</p>`
    : "";
  return `${texto}<p><img src="${esc(d.logoUrl)}" alt="Logo" width="180"></p>`;
}

// Cuerpo inicial al redactar: línea en blanco para escribir, la firma debajo y,
// si es respuesta o reenvío, el original citado después de la firma (como
// Gmail pone la firma antes del texto citado).
export function cuerpoInicial(firmaHtml: string, citaHtml = ""): string {
  const firma = firmaHtml ? `<p></p><p>--</p>${firmaHtml}` : "<p></p>";
  return `${firma}${citaHtml}`;
}

export function prefijoAsunto(asunto: string | null, prefijo: "Re:" | "Fwd:"): string {
  const base = (asunto ?? "").trim();
  const yaTiene = new RegExp(`^${prefijo.replace(":", "")}\\s*:`, "i");
  return yaTiene.test(base) ? base : `${prefijo} ${base}`.trim();
}

export function citarOriginal(o: {
  de: string | null;
  fecha: string;
  html: string | null;
  texto: string | null;
  reenvio?: boolean;
  asunto?: string | null;
  para?: string[];
}): string {
  const cuerpo = o.html ?? `<p>${esc(o.texto ?? "").replace(/\n/g, "<br>")}</p>`;
  const cabecera = o.reenvio
    ? `<p>---------- Mensaje reenviado ----------<br>De: ${esc(o.de ?? "")}<br>Fecha: ${esc(o.fecha)}<br>Asunto: ${esc(o.asunto ?? "")}<br>Para: ${esc((o.para ?? []).join(", "))}</p>`
    : `<p>El ${esc(o.fecha)}, ${esc(o.de ?? "")} escribió:</p>`;
  return `<p></p>${cabecera}<blockquote>${cuerpo}</blockquote>`;
}

function soloCorreo(d: string): string {
  return (d.match(/<([^>]+)>/)?.[1] ?? d).trim();
}

// "Responder a todos": el remitente va en Para y el resto de los destinatarios
// originales en CC, sin mi propia casilla ni repetidos.
export function destinatariosResponderATodos(o: {
  de: string | null;
  para: string[];
  cc: string[];
  // Casillas propias (a las que llegó el correo): no se agregan a CC.
  propios: string[];
}): { para: string[]; cc: string[] } {
  const remitente = o.de ? soloCorreo(o.de) : "";
  const vistos = new Set<string>([
    ...o.propios.map((p) => p.toLowerCase()),
    remitente.toLowerCase(),
  ]);
  const cc: string[] = [];
  for (const d of [...o.para, ...o.cc]) {
    const c = soloCorreo(d);
    const k = c.toLowerCase();
    if (!c || vistos.has(k)) continue;
    vistos.add(k);
    cc.push(c);
  }
  return { para: remitente ? [remitente] : [], cc };
}
