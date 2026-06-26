export type OrdenCompraEstado =
  | "borrador"
  | "enviada"
  | "recibida"
  | "cerrada";

const estados: Record<
  OrdenCompraEstado,
  { label: string; className: string }
> = {
  borrador: { label: "Borrador", className: "bg-slate-100 text-slate-700" },
  enviada: { label: "Enviada", className: "bg-blue-100 text-blue-700" },
  recibida: { label: "Recibida", className: "bg-green-100 text-green-700" },
  cerrada: { label: "Cerrada", className: "bg-slate-200 text-slate-600" },
};

export function EstadoBadge({ estado }: { estado: OrdenCompraEstado }) {
  const config = estados[estado] ?? estados.borrador;
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${config.className}`}
    >
      {config.label}
    </span>
  );
}
