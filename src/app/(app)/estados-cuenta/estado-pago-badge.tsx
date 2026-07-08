import type { EstadoPago } from "@/lib/estado-cuenta";

const config: Record<string, { label: string; className: string }> = {
  pendiente: { label: "Pendiente", className: "bg-amber-100 text-amber-700" },
  vencida: { label: "Vencida", className: "bg-red-100 text-red-700" },
  pagada: { label: "Pagada", className: "bg-green-100 text-green-700" },
  anulada: { label: "Anulada", className: "bg-slate-200 text-slate-600" },
};

// estado null = nota de crédito (no aplica estado de pago). `vencida` sube una
// factura pendiente a "Vencida" (rojo). Solo pasa a "Pagada" al marcar la nota.
export function EstadoPagoBadge({
  estado,
  vencida = false,
}: {
  estado: EstadoPago | null;
  vencida?: boolean;
}) {
  if (estado === null) {
    return (
      <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
        Crédito
      </span>
    );
  }
  const clave = estado === "pendiente" && vencida ? "vencida" : estado;
  const c = config[clave];
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${c.className}`}
    >
      {c.label}
    </span>
  );
}
