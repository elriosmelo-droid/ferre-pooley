import { createClient } from "@/lib/supabase/server";
import { getPerfilActual } from "@/lib/auth/rol";
import { normalizarRut } from "@/lib/rut";
import {
  construirEstadoCuenta,
  type EstadoPago,
  type VentaSiiEstadoCuenta,
} from "@/lib/estado-cuenta";
import { generarPdfEstadoCuenta } from "@/lib/pdf/estado-cuenta-pdf";

type VentaConNota = Omit<VentaSiiEstadoCuenta, "estado_nota"> & {
  notas_venta: { estado: EstadoPago } | { estado: EstadoPago }[] | null;
};

function conEstadoNota(v: VentaConNota): VentaSiiEstadoCuenta {
  const n = Array.isArray(v.notas_venta) ? v.notas_venta[0] : v.notas_venta;
  return { ...v, estado_nota: n?.estado ?? null };
}

export const maxDuration = 60;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // Datos financieros del cliente: exige miembro.
  const perfil = await getPerfilActual();
  if (!perfil) return new Response("No autorizado", { status: 401 });

  const { id } = await params;
  const supabase = await createClient();

  const { data: cliente } = await supabase
    .from("clientes")
    .select("id, nombre, rut")
    .eq("id", id)
    .maybeSingle();

  if (!cliente) return new Response("Cliente no encontrado", { status: 404 });

  const norm = normalizarRut(cliente.rut);
  const rutSii = norm.length >= 2 ? `${norm.slice(0, -1)}-${norm.slice(-1)}` : norm;

  const { data: ventas } = await supabase
    .from("ventas_sii")
    .select(
      "id, tipo_doc, rut_cliente, folio, fecha_emision, monto_total, forma_pago, term_pago_dias, fecha_vencimiento, fecha_vencimiento_manual, notas_venta(estado)"
    )
    .eq("rut_cliente", rutSii);

  const hoy = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Santiago",
  });
  const estado = construirEstadoCuenta(
    cliente.rut,
    ((ventas ?? []) as unknown as VentaConNota[]).map(conEstadoNota),
    hoy
  );

  const pdf = await generarPdfEstadoCuenta({
    cliente: { nombre: cliente.nombre, rut: cliente.rut },
    estado,
    fecha: new Date().toISOString(),
  });

  const nombreArchivo = `estado-cuenta-${cliente.nombre.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}.pdf`;

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${nombreArchivo}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
