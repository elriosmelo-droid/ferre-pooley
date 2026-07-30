// Formas de pago de una compra. Se cargan a mano (el RCV del SII no las informa)
// y son opcionales: una compra puede pagarse con varias a la vez (ej. cheque +
// débito), así que se guardan como arreglo. null o vacío = sin asignar.
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

export function esFormaPagoCompra(v: string): v is FormaPagoCompra {
  return (FORMAS_PAGO_COMPRA as readonly string[]).includes(v);
}

// Descarta valores desconocidos y duplicados, y ordena según FORMAS_PAGO_COMPRA
// para que la misma selección se muestre siempre igual.
export function normalizarFormasPago(valores: string[]): FormaPagoCompra[] {
  const validas = new Set(valores.filter(esFormaPagoCompra));
  return FORMAS_PAGO_COMPRA.filter((f) => validas.has(f));
}

// "Cheque, Débito" — o "—" si no hay ninguna cargada.
export function etiquetaFormasPago(valores: string[] | null): string {
  const formas = normalizarFormasPago(valores ?? []);
  return formas.length === 0
    ? "—"
    : formas.map((f) => FORMA_PAGO_COMPRA_LABEL[f]).join(", ");
}
