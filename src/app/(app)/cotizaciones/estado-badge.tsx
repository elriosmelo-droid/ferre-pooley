export type CotizacionEstado =
  | "borrador"
  | "enviada"
  | "aceptada"
  | "rechazada"
  | "vencida";

const estados: Record<CotizacionEstado, { label: string; className: string }> =
  {
    borrador: { label: "Borrador", className: "bg-slate-100 text-slate-700" },
    enviada: { label: "Enviada", className: "bg-blue-100 text-blue-700" },
    aceptada: { label: "Aceptada", className: "bg-green-100 text-green-700" },
    rechazada: { label: "Rechazada", className: "bg-red-100 text-red-700" },
    vencida: { label: "Vencida", className: "bg-amber-100 text-amber-700" },
  };

export function EstadoBadge({ estado }: { estado: CotizacionEstado }) {
  const config = estados[estado] ?? estados.borrador;
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${config.className}`}
    >
      {config.label}
    </span>
  );
}
