// Utilidades de fecha compartidas. Todo en 'AAAA-MM-DD' y calculado en UTC:
// el servidor corre en UTC y armar rangos con `new Date()` local corre los días.

const MESES_CORTOS = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

// Día en hora de Chile a partir de un timestamptz. Cortar el ISO directo
// devolvería el día UTC, que después de las ~20:00 chilenas ya es el siguiente.
export function diaChile(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
  }).format(new Date(iso));
}

// Hoy en Chile como 'AAAA-MM-DD'.
export function hoyChile(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
  }).format(new Date());
}

export type Mes = {
  clave: string; // 'AAAA-MM'
  etiqueta: string; // 'jul 26'
  desde: string; // primer día
  hasta: string; // último día
};

// Los últimos `n` meses terminando en el de `hoy`, del más reciente al más
// viejo. Sirve para atajos de filtro por mes.
//
// La aritmética va sobre año y mes como números, no sumando meses a un Date:
// restarle un mes a un 31 de agosto con `setMonth` da 31 de julio... o 1 de
// julio según el mes destino, y el atajo terminaría filtrando otro período.
export function ultimosMeses(hoy: string, n: number): Mes[] {
  const [anioHoy, mesHoy] = hoy.slice(0, 7).split("-").map(Number);
  const meses: Mes[] = [];
  for (let i = 0; i < n; i++) {
    // mesHoy es 1-12; se pasa a base 0 para poder restar y normalizar.
    const total = anioHoy * 12 + (mesHoy - 1) - i;
    const anio = Math.floor(total / 12);
    const mes = (total % 12) + 1; // 1-12
    const mm = String(mes).padStart(2, "0");
    // Día 0 del mes siguiente = último día de este mes; en UTC no se corre.
    const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
    meses.push({
      clave: `${anio}-${mm}`,
      etiqueta: `${MESES_CORTOS[mes - 1]} ${String(anio).slice(2)}`,
      desde: `${anio}-${mm}-01`,
      hasta: `${anio}-${mm}-${String(ultimo).padStart(2, "0")}`,
    });
  }
  return meses;
}

// Días entre dos fechas 'AAAA-MM-DD'. Negativo si `hasta` ya pasó.
//
// Se calcula en UTC a propósito: en los cambios de horario de verano hay días
// de 23 y 25 horas, y dividir milisegundos locales por 86.400.000 devolvería
// 2,96 o 3,04 días en vez de 3.
export function diasEntre(desde: string, hasta: string): number {
  const [a1, m1, d1] = desde.slice(0, 10).split("-").map(Number);
  const [a2, m2, d2] = hasta.slice(0, 10).split("-").map(Number);
  const ms = Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1);
  return Math.round(ms / 86400000);
}
