export type NotaVentaEstado = "pendiente" | "pagada" | "anulada";

const estados: Record<NotaVentaEstado, { label: string; className: string }> = {
  pendiente: {
    label: "Pendiente de pago",
    className: "bg-amber-100 text-amber-700",
  },
  pagada: { label: "Pagada", className: "bg-green-100 text-green-700" },
  anulada: { label: "Anulada", className: "bg-red-100 text-red-700" },
};

export function NotaEstadoBadge({ estado }: { estado: NotaVentaEstado }) {
  const config = estados[estado] ?? estados.pendiente;
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${config.className}`}
    >
      {config.label}
    </span>
  );
}
