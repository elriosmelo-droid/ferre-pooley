"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { calcularTotales } from "@/lib/totals";
import { MEDIOS_PAGO_VALORES } from "@/lib/medio-pago";
import { resolverVendedor } from "@/lib/vendedor";
import { autoVincularNota } from "@/lib/vinculo-nota";

export type NotaVentaActionResult = {
  error?: string;
  success?: boolean;
};

export async function marcarPagada(
  id: string
): Promise<NotaVentaActionResult> {
  const supabase = await createClient();

  // El .eq("estado") hace la transición atómica: si otra pestaña ya la
  // pagó o anuló, el update no afecta filas y se rechaza.
  const { data, error } = await supabase
    .from("notas_venta")
    .update({ estado: "pagada", pagada_at: new Date().toISOString() })
    .eq("id", id)
    .eq("estado", "pendiente")
    .select("id");

  if (error) {
    console.error("Error al marcar nota de venta como pagada:", error.message);
    return {
      error: "No se pudo marcar como pagada. Intenta nuevamente.",
    };
  }
  if (!data?.length) {
    return { error: "La nota de venta ya no está pendiente" };
  }

  revalidatePath("/notas-venta");
  revalidatePath(`/notas-venta/${id}`);
  return { success: true };
}

export type NotaVentaFormState = {
  error?: string;
  fieldErrors?: Partial<Record<"cliente_id" | "medio_pago" | "items", string[]>>;
};

const notaItemSchema = z.object({
  // Solo para prefill en el cliente; nota_venta_items no guarda producto_id.
  producto_id: z.uuid().nullable(),
  sku: z.string().trim(),
  descripcion: z.string().trim().min(1, "Cada ítem necesita una descripción"),
  cantidad: z
    .number("Ingresa una cantidad válida")
    .int("La cantidad debe ser un número entero")
    .min(1, "La cantidad debe ser al menos 1"),
  costo: z
    .number("Ingresa un costo válido")
    .int("El costo debe ser un número entero")
    .min(0, "El costo debe ser mayor o igual a 0"),
  precio: z
    .number("Ingresa un precio válido")
    .int("El precio debe ser un número entero")
    .min(0, "El precio debe ser mayor o igual a 0"),
  flete: z
    .number("Ingresa un flete válido")
    .int("El flete debe ser un número entero")
    .min(0, "El flete debe ser mayor o igual a 0"),
  descuento: z
    .number("Ingresa un descuento válido")
    .int("El descuento debe ser un número entero")
    .min(0, "El descuento debe ser mayor o igual a 0")
    .max(100, "El descuento no puede superar 100%"),
});

const notaVentaSchema = z.object({
  cliente_id: z.uuid("Selecciona un cliente"),
  medio_pago: z
    .array(z.enum(MEDIOS_PAGO_VALORES))
    .min(1, "Selecciona al menos un medio de pago"),
  items: z
    .array(notaItemSchema, "Los ítems no son válidos")
    .min(1, "Agrega al menos un ítem"),
});

function parseNotaVentaForm(formData: FormData) {
  let items: unknown = null;
  try {
    items = JSON.parse(String(formData.get("items") ?? "[]"));
  } catch {
    items = null;
  }
  return notaVentaSchema.safeParse({
    cliente_id: String(formData.get("cliente_id") ?? ""),
    medio_pago: formData.getAll("medio_pago").map(String),
    items,
  });
}

function toNotaVentaRow(data: z.infer<typeof notaVentaSchema>) {
  const totales = calcularTotales(data.items);
  return {
    cliente_id: data.cliente_id,
    medio_pago: data.medio_pago,
    flete: 0, // el flete vive por ítem; este campo global queda en 0
    subtotal_neto: totales.subtotalNeto,
    iva: totales.iva,
    total: totales.total,
  };
}

function toNotaItemRows(
  notaVentaId: string,
  items: z.infer<typeof notaItemSchema>[]
) {
  return items.map((item, index) => ({
    nota_venta_id: notaVentaId,
    sku: item.sku,
    descripcion: item.descripcion,
    cantidad: item.cantidad,
    costo: item.costo,
    precio: item.precio,
    flete: item.flete,
    descuento: item.descuento,
    posicion: index,
  }));
}

export async function crearNotaVenta(
  _prevState: NotaVentaFormState,
  formData: FormData
): Promise<NotaVentaFormState> {
  const parsed = parseNotaVentaForm(formData);
  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }

  const supabase = await createClient();
  const vendedor = await resolverVendedor(supabase);
  const { data: nota, error } = await supabase
    .from("notas_venta")
    .insert({ ...toNotaVentaRow(parsed.data), vendedor })
    .select("id")
    .single();

  if (error || !nota) {
    console.error("Error al crear nota de venta:", error?.message);
    return { error: "No se pudo guardar la nota de venta. Intenta nuevamente." };
  }

  const { error: itemsError } = await supabase
    .from("nota_venta_items")
    .insert(toNotaItemRows(nota.id, parsed.data.items));

  if (itemsError) {
    console.error("Error al guardar ítems:", itemsError.message);
    await supabase.from("notas_venta").delete().eq("id", nota.id);
    return { error: "No se pudo guardar la nota de venta. Intenta nuevamente." };
  }

  // Si hay una factura del SII que calza sin ambigüedad (mismo RUT + mismo
  // total), queda vinculada de inmediato.
  await autoVincularNota(supabase, nota.id);

  revalidatePath("/notas-venta");
  redirect(`/notas-venta/${nota.id}`);
}

export async function actualizarNotaVenta(
  id: string,
  _prevState: NotaVentaFormState,
  formData: FormData
): Promise<NotaVentaFormState> {
  const parsed = parseNotaVentaForm(formData);
  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }

  const supabase = await createClient();

  // .eq("estado") hace la transición atómica: si otra pestaña la pagó o
  // anuló, el update no afecta filas y se rechaza.
  const { data: updated, error: updateError } = await supabase
    .from("notas_venta")
    .update(toNotaVentaRow(parsed.data))
    .eq("id", id)
    .eq("estado", "pendiente")
    .select("id");

  if (updateError) {
    console.error("Error al actualizar nota de venta:", updateError.message);
    return {
      error: "No se pudo actualizar la nota de venta. Intenta nuevamente.",
    };
  }
  if (!updated?.length) {
    return { error: "Solo se pueden editar notas pendientes" };
  }

  const { error: deleteError } = await supabase
    .from("nota_venta_items")
    .delete()
    .eq("nota_venta_id", id);

  if (deleteError) {
    console.error("Error al reemplazar ítems:", deleteError.message);
    return { error: "No se pudieron actualizar los ítems. Intenta nuevamente." };
  }

  const { error: itemsError } = await supabase
    .from("nota_venta_items")
    .insert(toNotaItemRows(id, parsed.data.items));

  if (itemsError) {
    console.error("Error al guardar ítems:", itemsError.message);
    return { error: "No se pudieron actualizar los ítems. Intenta nuevamente." };
  }

  // El total pudo cambiar: reintenta el calce automático (autoVincularNota
  // no toca notas que ya tienen factura vinculada).
  await autoVincularNota(supabase, id);

  revalidatePath("/notas-venta");
  revalidatePath(`/notas-venta/${id}`);
  redirect(`/notas-venta/${id}`);
}

// Borrado definitivo: elimina la nota y, por FK on delete cascade, sus ítems.
// La cotización de origen queda intacta (estado "aceptada"); como su vínculo es
// único, no se podrá generar otra nota desde esa cotización.
export async function eliminarNotaVenta(
  id: string
): Promise<NotaVentaActionResult> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("notas_venta")
    .delete()
    .eq("id", id)
    .select("id");

  if (error) {
    console.error("Error al eliminar nota de venta:", error.message);
    return {
      error: "No se pudo eliminar la nota de venta. Intenta nuevamente.",
    };
  }
  if (!data?.length) {
    return { error: "La nota de venta ya no existe" };
  }

  revalidatePath("/notas-venta");
  redirect("/notas-venta");
}

// Adjunta una factura del SII a una nota de venta. El vínculo vive en
// ventas_sii.nota_venta_id (una nota agrupa varias facturas). El `is null`
// evita robar una factura ya asignada a otra nota.
export async function vincularFacturaVenta(
  notaId: string,
  ventaSiiId: string
): Promise<NotaVentaActionResult> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("ventas_sii")
    .update({ nota_venta_id: notaId })
    .eq("id", ventaSiiId)
    .is("nota_venta_id", null)
    .select("id");

  if (error) {
    console.error("Error al vincular factura del SII:", error.message);
    return { error: "No se pudo vincular la factura. Intenta nuevamente." };
  }
  if (!data?.length) {
    return { error: "Esa factura ya está vinculada a otra nota de venta." };
  }

  revalidatePath(`/notas-venta/${notaId}`);
  revalidatePath("/ventas");
  revalidatePath("/conciliacion");
  return { success: true };
}

// Quita una factura de su nota (se identifica por la factura, no por la nota,
// porque una nota puede tener varias).
export async function desvincularFacturaVenta(
  ventaSiiId: string
): Promise<NotaVentaActionResult> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("ventas_sii")
    .update({ nota_venta_id: null })
    .eq("id", ventaSiiId);

  if (error) {
    console.error("Error al desvincular factura del SII:", error.message);
    return { error: "No se pudo desvincular la factura. Intenta nuevamente." };
  }

  revalidatePath("/notas-venta");
  revalidatePath("/ventas");
  revalidatePath("/conciliacion");
  return { success: true };
}

export async function anularNotaVenta(
  id: string
): Promise<NotaVentaActionResult> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("notas_venta")
    .update({ estado: "anulada" })
    .eq("id", id)
    .eq("estado", "pendiente")
    .select("id");

  if (error) {
    console.error("Error al anular nota de venta:", error.message);
    return {
      error: "No se pudo anular la nota de venta. Intenta nuevamente.",
    };
  }
  if (!data?.length) {
    return { error: "Solo se pueden anular notas pendientes" };
  }

  revalidatePath("/notas-venta");
  revalidatePath(`/notas-venta/${id}`);
  return { success: true };
}
