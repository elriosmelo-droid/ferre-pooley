// Normaliza un RUT a solo dígitos + dígito verificador en mayúscula, sin puntos
// ni guion: "76.109.779-2" y "76109779-2" -> "761097792". Sirve para comparar
// RUTs que vienen con formatos distintos (cliente local vs SII).
export function normalizarRut(valor: string | null | undefined): string {
  return (valor ?? "").replace(/[^0-9kK]/g, "").toUpperCase();
}

// Formatea un RUT chileno agregando puntos de miles y guion antes del dígito
// verificador: "12345678k" -> "12.345.678-K". Tolera entrada parcial (mientras
// el usuario escribe) y descarta cualquier carácter que no sea dígito o K.
export function formatearRut(valor: string): string {
  const limpio = valor.replace(/[^0-9kK]/g, "").toUpperCase();
  if (limpio.length === 0) return "";
  if (limpio.length === 1) return limpio;
  const cuerpo = limpio.slice(0, -1);
  const dv = limpio.slice(-1);
  const cuerpoFmt = cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${cuerpoFmt}-${dv}`;
}
