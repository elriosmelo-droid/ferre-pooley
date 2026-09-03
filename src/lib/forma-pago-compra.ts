import { formatCLP } from "./money";

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

// Formas que dejan deuda con el proveedor. Son las mismas que admiten plazo: lo
// que se paga a plazo es justamente lo que todavía se debe. Contado,
// transferencia y débito salen de la caja en el acto; "otro" se trata como
// pagado (si algún día deja deuda, va acá y no en una lista aparte).
export function esFormaDeuda(forma: FormaPagoCompra): boolean {
  return admitePlazo(forma);
}

// Cuánto de esta compra queda por pagar.
//
// Devuelve null cuando no hay formas cargadas: no se sabe si se debe o no, y
// mostrar $0 ahí sería afirmar algo que nadie declaró.
//
// Los montos son opcionales, así que la única forma sin monto absorbe lo que
// falte para llegar al total del documento. Eso cubre el caso normal de una
// sola forma (donde el monto es el total y no hace falta escribirlo) y el de
// "débito $30.000 y el resto a crédito". Con dos o más montos sin indicar el
// reparto es ambiguo y no se inventa: solo suma lo escrito.
export function montoDeuda(
  items: FormaPagoItem[],
  montoTotal: number
): number | null {
  if (items.length === 0) return null;

  const sinMonto = items.filter((i) => i.monto === null);
  const asignado = sumaMontos(items);
  // El remanente nunca es negativo: si lo escrito ya se pasa del total, no
  // queda nada que absorber.
  const remanente =
    sinMonto.length === 1 ? Math.max(montoTotal - asignado, 0) : 0;

  return items.reduce((deuda, i) => {
    if (!esFormaDeuda(i.forma)) return deuda;
    return deuda + (i.monto ?? (sinMonto.length === 1 ? remanente : 0));
  }, 0);
}

// Suma de deudas de varias compras, ignorando las que no tienen formas
// cargadas. `pendientes` cuenta esas: sin ellas el total puede quedar corto y
// conviene decirlo en pantalla.
export function totalDeuda(
  compras: { items: FormaPagoItem[]; montoTotal: number }[]
): { total: number; pendientes: number } {
  let total = 0;
  let pendientes = 0;
  for (const c of compras) {
    const deuda = montoDeuda(c.items, c.montoTotal);
    if (deuda === null) pendientes += 1;
    else total += deuda;
  }
  return { total, pendientes };
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
