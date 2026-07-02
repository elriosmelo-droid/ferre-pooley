import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizarRut } from "@/lib/rut";

// Al crear una nota la factura del SII suele existir de antes: se mira hacia
// atrás. El margen hacia adelante cubre facturas emitidas el mismo día con
// desfase de zona horaria.
const DIAS_ATRAS = 90;
const DIAS_ADELANTE = 2;

// Vincula la nota recién creada con una factura del SII si hay un calce
// inequívoco: mismo RUT de cliente + mismo total + factura sin nota. Con 0 o
// varias candidatas no hace nada (quedan como sugerencia manual). Best-effort:
// nunca lanza, la creación de la nota no depende de esto.
export async function autoVincularNota(
  supabase: SupabaseClient,
  notaId: string
): Promise<string | null> {
  try {
    const { data: notaData } = await supabase
      .from("notas_venta")
      .select("id, total, created_at, clientes(rut)")
      .eq("id", notaId)
      .single();

    const nota = notaData as unknown as {
      id: string;
      total: number;
      created_at: string;
      clientes: { rut: string | null } | null;
    } | null;
    if (!nota) return null;

    const rutNota = normalizarRut(nota.clientes?.rut);
    if (!rutNota) return null;

    // Con factura ya vinculada no se agrega otra a ciegas (los casos de
    // varias facturas por nota se arman a mano en la conciliación).
    const { count } = await supabase
      .from("ventas_sii")
      .select("id", { count: "exact", head: true })
      .eq("nota_venta_id", notaId);
    if (count && count > 0) return null;

    const { data: ventasData } = await supabase
      .from("ventas_sii")
      .select("id, folio, rut_cliente, monto_total, fecha_emision")
      .is("nota_venta_id", null)
      .eq("monto_total", nota.total);

    const diaNota = Math.floor(new Date(nota.created_at).getTime() / 86_400_000);
    const candidatas = (ventasData ?? []).filter((v) => {
      if (normalizarRut(v.rut_cliente) !== rutNota) return false;
      if (!v.fecha_emision) return false;
      const diaFactura = Math.floor(
        new Date(v.fecha_emision).getTime() / 86_400_000
      );
      return (
        diaFactura >= diaNota - DIAS_ATRAS && diaFactura <= diaNota + DIAS_ADELANTE
      );
    });

    if (candidatas.length !== 1) return null; // 0 o ambiguo -> manual

    const { error } = await supabase
      .from("ventas_sii")
      .update({ nota_venta_id: notaId })
      .eq("id", candidatas[0].id)
      .is("nota_venta_id", null);

    return error ? null : candidatas[0].folio;
  } catch (err) {
    console.error("Error en auto-vínculo de nota:", err);
    return null;
  }
}
