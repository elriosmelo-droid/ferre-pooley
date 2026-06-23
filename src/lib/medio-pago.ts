// Medios de pago aceptados en una cotización. El valor se guarda en DB (enum
// medio_pago); la etiqueta es lo que ven el equipo y el cliente.
export const MEDIOS_PAGO = [
  { valor: "transferencia", etiqueta: "Transferencia" },
  { valor: "credito", etiqueta: "Crédito" },
  { valor: "tarjeta", etiqueta: "Tarjetas bancarias" },
  { valor: "cheque", etiqueta: "Cheque" },
  { valor: "contado", etiqueta: "Contado" },
] as const;

export type MedioPago = (typeof MEDIOS_PAGO)[number]["valor"];

export const MEDIOS_PAGO_VALORES = MEDIOS_PAGO.map((m) => m.valor) as [
  MedioPago,
  ...MedioPago[],
];

export function etiquetaMedioPago(valor: string | null | undefined): string {
  return MEDIOS_PAGO.find((m) => m.valor === valor)?.etiqueta ?? "—";
}

// Une las etiquetas de una lista de medios de pago, en el orden canónico.
export function etiquetasMedioPago(
  valores: readonly string[] | null | undefined
): string {
  if (!valores || valores.length === 0) return "—";
  return MEDIOS_PAGO.filter((m) => valores.includes(m.valor))
    .map((m) => m.etiqueta)
    .join(" · ");
}
