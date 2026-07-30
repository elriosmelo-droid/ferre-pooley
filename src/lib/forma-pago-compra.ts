// Forma de pago de una compra. Se carga a mano (el RCV del SII no la informa) y
// es opcional: null significa "sin asignar".
export const FORMAS_PAGO_COMPRA = [
  "contado",
  "transferencia",
  "credito",
  "debito",
  "otro",
] as const;

export type FormaPagoCompra = (typeof FORMAS_PAGO_COMPRA)[number];

export const FORMA_PAGO_COMPRA_LABEL: Record<FormaPagoCompra, string> = {
  contado: "Contado",
  transferencia: "Transferencia",
  credito: "Crédito",
  debito: "Débito",
  otro: "Otro",
};

export function esFormaPagoCompra(v: string): v is FormaPagoCompra {
  return (FORMAS_PAGO_COMPRA as readonly string[]).includes(v);
}

export function etiquetaFormaPago(v: string | null): string {
  return v && esFormaPagoCompra(v) ? FORMA_PAGO_COMPRA_LABEL[v] : "—";
}
