"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createElement } from "react";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { calcularTotales } from "@/lib/totals";
import { formatCLP } from "@/lib/money";
import { generarPdfOrdenCompra } from "@/lib/pdf/orden-compra-pdf";
import { OrdenCompraEmail } from "@/lib/email/orden-compra-email";
import { enviarCorreoCotizacion } from "@/lib/email/send";

export type OrdenCompraFormState = {
  error?: string;
  fieldErrors?: Partial<
    Record<"proveedor_id" | "notas" | "plazo_pago" | "items", string[]>
  >;
};

const itemSchema = z.object({
  producto_id: z.uuid().nullable(),
  sku: z.string().trim(),
  descripcion: z.string().trim().min(1, "Cada ítem necesita una descripción"),
  cantidad: z
    .number("Ingresa una cantidad válida")
    .int("La cantidad debe ser un número entero")
    .min(1, "La cantidad debe ser al menos 1"),
  precio: z
    .number("Ingresa un precio válido")
    .int("El precio debe ser un número entero")
    .min(0, "El precio debe ser mayor o igual a 0"),
});

const ordenSchema = z.object({
  proveedor_id: z.uuid("Selecciona un proveedor"),
  notas: z.string().trim().optional(),
  plazo_pago: z.string().trim().optional(),
  items: z
    .array(itemSchema, "Los ítems no son válidos")
    .min(1, "Agrega al menos un ítem"),
});

function parseOrdenForm(formData: FormData) {
  let items: unknown = null;
  try {
    items = JSON.parse(String(formData.get("items") ?? "[]"));
  } catch {
    items = null;
  }

  return ordenSchema.safeParse({
    proveedor_id: String(formData.get("proveedor_id") ?? ""),
    notas: String(formData.get("notas") ?? ""),
    plazo_pago: String(formData.get("plazo_pago") ?? ""),
    items,
  });
}

function toOrdenRow(data: z.infer<typeof ordenSchema>) {
  const totales = calcularTotales(data.items);
  return {
    proveedor_id: data.proveedor_id,
    notas: data.notas || null,
    plazo_pago: data.plazo_pago || null,
    subtotal_neto: totales.subtotalNeto,
    iva: totales.iva,
    total: totales.total,
  };
}

function toItemRows(
  ordenId: string,
  items: z.infer<typeof itemSchema>[]
) {
  return items.map((item, index) => ({
    orden_compra_id: ordenId,
    producto_id: item.producto_id,
    sku: item.sku,
    descripcion: item.descripcion,
    cantidad: item.cantidad,
    precio: item.precio,
    posicion: index,
  }));
}

// Nombre del comprador que crea la orden: nombre de su perfil, o su correo
// como respaldo si todavía no lo cargó.
async function resolverComprador(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: perfil } = await supabase
    .from("perfiles")
    .select("nombre")
    .eq("user_id", user.id)
    .maybeSingle();
  return perfil?.nombre?.trim() || user.email || null;
}

export async function crearOrdenCompra(
  _prevState: OrdenCompraFormState,
  formData: FormData
): Promise<OrdenCompraFormState> {
  const parsed = parseOrdenForm(formData);
  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }

  const supabase = await createClient();
  const comprador = await resolverComprador(supabase);
  const { data: orden, error } = await supabase
    .from("ordenes_compra")
    .insert({ ...toOrdenRow(parsed.data), comprador })
    .select("id")
    .single();

  if (error || !orden) {
    console.error("Error al crear orden de compra:", error?.message);
    return { error: "No se pudo guardar la orden. Intenta nuevamente." };
  }

  const { error: itemsError } = await supabase
    .from("orden_compra_items")
    .insert(toItemRows(orden.id, parsed.data.items));

  if (itemsError) {
    console.error("Error al guardar ítems:", itemsError.message);
    await supabase.from("ordenes_compra").delete().eq("id", orden.id);
    return { error: "No se pudo guardar la orden. Intenta nuevamente." };
  }

  revalidatePath("/ordenes-compra");
  redirect(`/ordenes-compra/${orden.id}`);
}

export async function actualizarOrdenCompra(
  id: string,
  _prevState: OrdenCompraFormState,
  formData: FormData
): Promise<OrdenCompraFormState> {
  const parsed = parseOrdenForm(formData);
  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }

  const supabase = await createClient();

  const { data: actual, error: readError } = await supabase
    .from("ordenes_compra")
    .select("estado")
    .eq("id", id)
    .single();

  if (readError || !actual) {
    return { error: "No se encontró la orden." };
  }
  if (actual.estado !== "borrador") {
    return { error: "Solo se pueden editar borradores" };
  }

  // .eq("estado") hace la transición atómica: si otra pestaña ya la envió,
  // el update no afecta filas y se rechaza.
  const { data: updated, error: updateError } = await supabase
    .from("ordenes_compra")
    .update(toOrdenRow(parsed.data))
    .eq("id", id)
    .eq("estado", "borrador")
    .select("id");

  if (updateError) {
    console.error("Error al actualizar orden:", updateError.message);
    return { error: "No se pudo actualizar la orden. Intenta nuevamente." };
  }
  if (!updated?.length) {
    return { error: "Solo se pueden editar borradores" };
  }

  const { error: deleteError } = await supabase
    .from("orden_compra_items")
    .delete()
    .eq("orden_compra_id", id);

  if (deleteError) {
    console.error("Error al reemplazar ítems:", deleteError.message);
    return { error: "No se pudieron actualizar los ítems. Intenta nuevamente." };
  }

  const { error: itemsError } = await supabase
    .from("orden_compra_items")
    .insert(toItemRows(id, parsed.data.items));

  if (itemsError) {
    console.error("Error al guardar ítems:", itemsError.message);
    return { error: "No se pudieron actualizar los ítems. Intenta nuevamente." };
  }

  revalidatePath("/ordenes-compra");
  revalidatePath(`/ordenes-compra/${id}`);
  redirect(`/ordenes-compra/${id}`);
}

export type EnviarOrdenResult = { error?: string; success?: boolean };

export async function enviarOrdenCompra(
  id: string
): Promise<EnviarOrdenResult> {
  const supabase = await createClient();

  const { data: orden, error: readError } = await supabase
    .from("ordenes_compra")
    .select(
      `id, folio, estado, comprador, plazo_pago, subtotal_neto, iva, total, notas, created_at,
       proveedores(razon_social, rut, correo),
       orden_compra_items(sku, descripcion, cantidad, precio, posicion)`
    )
    .eq("id", id)
    .single();

  if (readError || !orden) {
    console.error("Error al leer orden a enviar:", readError?.message);
    return { error: "No se encontró la orden." };
  }

  const proveedor = orden.proveedores as unknown as {
    razon_social: string | null;
    rut: string;
    correo: string | null;
  } | null;
  const items = [
    ...(orden.orden_compra_items as unknown as {
      sku: string;
      descripcion: string;
      cantidad: number;
      precio: number;
      posicion: number;
    }[]),
  ].sort((a, b) => a.posicion - b.posicion);

  if (orden.estado !== "borrador") {
    return { error: "Solo se pueden enviar borradores" };
  }
  if (items.length === 0) {
    return { error: "La orden no tiene ítems" };
  }
  if (!proveedor?.correo?.trim()) {
    return {
      error:
        "El proveedor no tiene correo cargado. Podés ver el PDF y enviárselo tú (ej. por WhatsApp), o cargarle un correo en Proveedores.",
    };
  }

  const { data: perfil } = await supabase
    .from("perfiles")
    .select("razon_social")
    .limit(1)
    .maybeSingle();

  const empresa = perfil?.razon_social || "Tulbless";

  try {
    const pdf = await generarPdfOrdenCompra({
      orden: {
        folio: orden.folio,
        created_at: orden.created_at,
        comprador: orden.comprador as string | null,
        plazo_pago: orden.plazo_pago as string | null,
        subtotal_neto: orden.subtotal_neto,
        iva: orden.iva,
        total: orden.total,
        notas: orden.notas,
      },
      items,
      proveedor: {
        razon_social: proveedor.razon_social,
        rut: proveedor.rut,
        correo: proveedor.correo,
      },
    });

    await enviarCorreoCotizacion({
      para: proveedor.correo,
      asunto: `Orden de compra ${orden.folio} — ${empresa}`,
      react: createElement(OrdenCompraEmail, {
        folio: orden.folio,
        proveedorNombre: proveedor.razon_social || proveedor.rut,
        total: formatCLP(orden.total),
        empresa,
      }),
      adjuntoPdf: pdf,
      nombreAdjunto: `${orden.folio}.pdf`,
    });
  } catch (error) {
    console.error("Error al enviar orden por correo:", error);
    return {
      error:
        "No se pudo enviar el correo. Revisa la configuración de Resend e intenta de nuevo.",
    };
  }

  // El correo ya salió; recién ahora cambiamos el estado. El .eq("estado")
  // garantiza la transición atómica si otra pestaña la envió en paralelo.
  const { data: updated, error: updateError } = await supabase
    .from("ordenes_compra")
    .update({ estado: "enviada", enviada_at: new Date().toISOString() })
    .eq("id", id)
    .eq("estado", "borrador")
    .select("id");

  if (updateError) {
    console.error(
      `Correo de orden ${orden.folio} enviado pero falló el cambio de estado:`,
      updateError.message
    );
    return {
      error:
        "El correo se envió pero no se pudo actualizar el estado. Intenta nuevamente.",
    };
  }
  if (!updated?.length) {
    return { error: "La orden ya no es un borrador" };
  }

  revalidatePath("/ordenes-compra");
  revalidatePath(`/ordenes-compra/${id}`);
  return { success: true };
}

// Avanza el estado tras el envío: enviada → recibida → cerrada. Cada paso es
// atómico vía .eq("estado") sobre el estado de origen esperado.
export async function marcarRecibida(id: string): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from("ordenes_compra")
    .update({ estado: "recibida", recibida_at: new Date().toISOString() })
    .eq("id", id)
    .eq("estado", "enviada");
  revalidatePath("/ordenes-compra");
  revalidatePath(`/ordenes-compra/${id}`);
}

export type CerrarOrdenResult = { error?: string; success?: boolean };

export async function cerrarOrden(
  id: string,
  observacion: string
): Promise<CerrarOrdenResult> {
  const obs = observacion.trim();
  if (obs === "") {
    return { error: "Debes dejar una observación para cerrar la orden." };
  }

  const supabase = await createClient();
  // .eq("estado","recibida") mantiene la transición atómica.
  const { data, error } = await supabase
    .from("ordenes_compra")
    .update({
      estado: "cerrada",
      observacion_cierre: obs,
      cerrada_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("estado", "recibida")
    .select("id");

  if (error) {
    console.error("Error al cerrar orden:", error.message);
    return { error: "No se pudo cerrar la orden. Intenta nuevamente." };
  }
  if (!data?.length) {
    return { error: "La orden ya no se puede cerrar." };
  }

  revalidatePath("/ordenes-compra");
  revalidatePath(`/ordenes-compra/${id}`);
  return { success: true };
}
