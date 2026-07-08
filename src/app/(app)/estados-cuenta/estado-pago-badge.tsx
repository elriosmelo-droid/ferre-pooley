import type { EstadoPago } from "@/lib/estado-cuenta";

const config: Record<EstadoPago, { label: string; className: string }> = {
  pendiente: { label: "Pendiente", className: "bg-amber-100 text-amber-700" },
  pagada: { label: "Pagada", className: "bg-green-100 text-green-700" },
  anulada: { label: "Anulada", className: "bg-red-100 text-red-700" },
};

// estado null = nota de crédito (no aplica estado de pago).
export function EstadoPagoBadge({ estado }: { estado: EstadoPago | null }) {
  if (estado === null) {
    return (
      <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
        Crédito
      </span>
    );
  }
  const c = config[estado];
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${c.className}`}
    >
      {c.label}
    </span>
  );
}
