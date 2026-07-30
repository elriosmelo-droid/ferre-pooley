import { formatCLP } from "@/lib/money";

// Formas de pago de una compra. Se cargan a mano (el RCV del SII no las informa)
// y son opcionales. Una compra puede pagarse con varias a la vez (ej. cheque +
// débito) y en ese caso interesa cuánto fue con cada una.
export const FORMAS_PAGO_COMPRA = [
  "contado",
  "transferencia",
  "cheque",
  "credito",
  "debito",
  "otro",
] as const;

export type FormaPagoCompra = (typeof FORMAS_PAGO_COMPRA)[number];

export const FORMA_PAGO_COMPRA_LABEL: Record<FormaPagoCompra, string> = {
  contado: "Contado",
  transferencia: "Transferencia",
  cheque: "Cheque",
  credito: "Crédito",
  debito: "Débito",
  otro: "Otro",
};

// Solo estas formas se pagan a plazo; en las demás el plazo no tiene sentido y
// se descarta al normalizar.
export const FORMAS_CON_PLAZO: readonly FormaPagoCompra[] = ["cheque", "credito"];

export function admitePlazo(forma: FormaPagoCompra): boolean {
  return FORMAS_CON_PLAZO.includes(forma);
}

// Forma, cuánto se pagó con ella y a cuántos días.
// - `monto` en null = no indicado: con una sola forma el monto es el total del
//   documento y no hace falta escribirlo.
// - `plazo_dias` en null = sin plazo (o forma que no admite plazo). Se cuenta
//   desde la emisión de la factura.
export type FormaPagoItem = {
  forma: FormaPagoCompra;
  monto: number | null;
  plazo_dias: number | null;
};

// Vencimiento = emisión + plazo. Se calcula en UTC para que el resultado no se
// corra un día según la zona horaria del navegador (fecha_emision es YYYY-MM-DD).
export function vencimientoDesde(
  fechaEmision: string | null,
  plazoDias: number | null
): string | null {
  if (!fechaEmision || plazoDias === null) return null;
  const [a, m, d] = fechaEmision.slice(0, 10).split("-").map(Number);
  if (!a || !m || !d) return null;
  const fecha = new Date(Date.UTC(a, m - 1, d));
  fecha.setUTCDate(fecha.getUTCDate() + plazoDias);
  const dd = String(fecha.getUTCDate()).padStart(2, "0");
  const mm = String(fecha.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${fecha.getUTCFullYear()}`;
}

export function esFormaPagoCompra(v: string): v is FormaPagoCompra {
  return (FORMAS_PAGO_COMPRA as readonly string[]).includes(v);
}

function montoValido(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  const n = Math.trunc(v);
  return n >= 0 ? n : null;
}

// Un plazo de 0 días es lo mismo que no tener plazo.
function plazoValido(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  const n = Math.trunc(v);
  return n > 0 ? n : null;
}

// Lee lo que venga de la columna jsonb (o del cliente) y devuelve solo items
// válidos: descarta formas desconocidas, deduplica quedándose con la primera
// aparición y ordena según FORMAS_PAGO_COMPRA, para que la misma selección se
// muestre siempre igual.
export function normalizarItemsPago(valor: unknown): FormaPagoItem[] {
  if (!Array.isArray(valor)) return [];
  const porForma = new Map<FormaPagoCompra, FormaPagoItem>();
  for (const bruto of valor) {
    if (typeof bruto !== "object" || bruto === null) continue;
    const forma = (bruto as { forma?: unknown }).forma;
    if (typeof forma !== "string" || !esFormaPagoCompra(forma)) continue;
    if (porForma.has(forma)) continue;
    const plazo = plazoValido((bruto as { plazo_dias?: unknown }).plazo_dias);
    porForma.set(forma, {
      forma,
      monto: montoValido((bruto as { monto?: unknown }).monto),
      // El plazo solo se conserva donde tiene sentido (cheque y crédito).
      plazo_dias: admitePlazo(forma) ? plazo : null,
    });
  }
  return FORMAS_PAGO_COMPRA.filter((f) => porForma.has(f)).map(
    (f) => porForma.get(f)!
  );
}

export function formasDe(items: FormaPagoItem[]): FormaPagoCompra[] {
  return items.map((i) => i.forma);
}

// Suma de los montos indicados. Los null no suman: la diferencia con el total
// del documento es justamente lo que queda por asignar.
export function sumaMontos(items: FormaPagoItem[]): number {
  return items.reduce((s, i) => s + (i.monto ?? 0), 0);
}

// Resumen de una forma: monto solo si hay varias, plazo si lo tiene.
// "Cheque $50.000 60d"
function resumenItem(item: FormaPagoItem, mostrarMonto: boolean): string {
  const partes = [FORMA_PAGO_COMPRA_LABEL[item.forma]];
  if (mostrarMonto && item.monto !== null) partes.push(formatCLP(item.monto));
  if (item.plazo_dias !== null) partes.push(`${item.plazo_dias}d`);
  return partes.join(" ");
}

// "Transferencia" con una sola forma; "Cheque $50.000 60d · Débito $30.000"
// cuando hay varias. El monto se omite con una sola forma porque es el total del
// documento; el plazo se muestra siempre que exista.
export function etiquetaItemsPago(items: FormaPagoItem[]): string {
  if (items.length === 0) return "—";
  const mostrarMonto = items.length > 1;
  return items.map((i) => resumenItem(i, mostrarMonto)).join(" · ");
}
