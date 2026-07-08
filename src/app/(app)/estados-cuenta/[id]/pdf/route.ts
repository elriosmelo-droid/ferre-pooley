import { createClient } from "@/lib/supabase/server";
import { getPerfilActual } from "@/lib/auth/rol";
import { normalizarRut } from "@/lib/rut";
import {
  construirEstadoCuenta,
  type VentaSiiEstadoCuenta,
  type NotaEstadoCuenta,
} from "@/lib/estado-cuenta";
import { generarPdfEstadoCuenta } from "@/lib/pdf/estado-cuenta-pdf";

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

  const [{ data: ventas }, { data: notas }] = await Promise.all([
    supabase
      .from("ventas_sii")
      .select(
        "id, tipo_doc, rut_cliente, folio, fecha_emision, monto_total, forma_pago, term_pago_dias, fecha_vencimiento"
      )
      .eq("rut_cliente", rutSii),
    supabase
      .from("notas_venta")
      .select("venta_sii_id, estado")
      .eq("cliente_id", cliente.id),
  ]);

  const hoy = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Santiago",
  });
  const estado = construirEstadoCuenta(
    cliente.rut,
    (ventas ?? []) as VentaSiiEstadoCuenta[],
    (notas ?? []) as NotaEstadoCuenta[],
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
