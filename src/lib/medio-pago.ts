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
