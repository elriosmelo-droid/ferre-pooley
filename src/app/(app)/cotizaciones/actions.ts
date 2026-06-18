"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createElement } from "react";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { calcularTotales } from "@/lib/totals";
import { formatCLP } from "@/lib/money";
import { APP_URL } from "@/lib/app-url";
import { generarPdfCotizacion } from "@/lib/pdf/cotizacion-pdf";
import { CotizacionEmail } from "@/lib/email/cotizacion-email";
import { enviarCorreoCotizacion } from "@/lib/email/send";

export type CotizacionFormState = {
  error?: string;
  fieldErrors?: Partial<
    Record<
      "cliente_id" | "fecha_validez" | "flete" | "notas" | "items",
      string[]
    >
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
  costo: z
    .number("Ingresa un costo válido")
    .int("El costo debe ser un número entero")
    .min(0, "El costo debe ser mayor o igual a 0"),
  precio: z
    .number("Ingresa un precio válido")
    .int("El precio debe ser un número entero")
    .min(0, "El precio debe ser mayor o igual a 0"),
});

const cotizacionSchema = z.object({
  cliente_id: z.uuid("Selecciona un cliente"),
  fecha_validez: z.iso.date("Ingresa una fecha de validez válida"),
  flete: z.coerce
    .number("Ingresa un flete válido")
    .int("El flete debe ser un número entero")
    .min(0, "El flete debe ser mayor o igual a 0"),
  notas: z.string().trim().optional(),
  items: z
    .array(itemSchema, "Los ítems no son válidos")
    .min(1, "Agrega al menos un ítem"),
});

function parseCotizacionForm(formData: FormData) {
  let items: unknown = null;
  try {
    items = JSON.parse(String(formData.get("items") ?? "[]"));
  } catch {
    items = null;
  }

  return cotizacionSchema.safeParse({
    cliente_id: String(formData.get("cliente_id") ?? ""),
    fecha_validez: String(formData.get("fecha_validez") ?? ""),
    flete: String(formData.get("flete") ?? "0"),
    notas: String(formData.get("notas") ?? ""),
    items,
  });
}

function toCotizacionRow(data: z.infer<typeof cotizacionSchema>) {
  const totales = calcularTotales(data.items, data.flete);
  return {
    cliente_id: data.cliente_id,
    fecha_validez: data.fecha_validez,
    flete: data.flete,
    notas: data.notas || null,
    subtotal_neto: totales.subtotalNeto,
    iva: totales.iva,
    total: totales.total,
  };
}

function toItemRows(
  cotizacionId: string,
  items: z.infer<typeof itemSchema>[]
) {
  return items.map((item, index) => ({
    cotizacion_id: cotizacionId,
    producto_id: item.producto_id,
    sku: item.sku,
    descripcion: item.descripcion,
    cantidad: item.cantidad,
    costo: item.costo,
    precio: item.precio,
    posicion: index,
  }));
}

export async function crearCotizacion(
  _prevState: CotizacionFormState,
  formData: FormData
): Promise<CotizacionFormState> {
  const parsed = parseCotizacionForm(formData);
  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }

  const supabase = await createClient();
  const { data: cotizacion, error } = await supabase
    .from("cotizaciones")
    .insert(toCotizacionRow(parsed.data))
    .select("id")
    .single();

  if (error || !cotizacion) {
    console.error("Error al crear cotización:", error?.message);
    return { error: "No se pudo guardar la cotización. Intenta nuevamente." };
  }

  const { error: itemsError } = await supabase
    .from("cotizacion_items")
    .insert(toItemRows(cotizacion.id, parsed.data.items));

  if (itemsError) {
    console.error("Error al guardar ítems:", itemsError.message);
    await supabase.from("cotizaciones").delete().eq("id", cotizacion.id);
    return { error: "No se pudo guardar la cotización. Intenta nuevamente." };
  }

  revalidatePath("/cotizaciones");
  redirect(`/cotizaciones/${cotizacion.id}`);
}

export async function actualizarCotizacion(
  id: string,
  _prevState: CotizacionFormState,
  formData: FormData
): Promise<CotizacionFormState> {
  const parsed = parseCotizacionForm(formData);
  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }

  const supabase = await createClient();

  const { data: actual, error: readError } = await supabase
    .from("cotizaciones")
    .select("estado")
    .eq("id", id)
    .single();

  if (readError || !actual) {
    return { error: "No se encontró la cotización." };
  }
  if (actual.estado !== "borrador") {
    return { error: "Solo se pueden editar borradores" };
  }

  // .eq("estado") hace la transición atómica: si otra pestaña ya la envió,
  // el update no afecta filas y se rechaza.
  const { data: updated, error: updateError } = await supabase
    .from("cotizaciones")
    .update(toCotizacionRow(parsed.data))
    .eq("id", id)
    .eq("estado", "borrador")
    .select("id");

  if (updateError) {
    console.error("Error al actualizar cotización:", updateError.message);
    return {
      error: "No se pudo actualizar la cotización. Intenta nuevamente.",
    };
  }
  if (!updated?.length) {
    return { error: "Solo se pueden editar borradores" };
  }

  const { error: deleteError } = await supabase
    .from("cotizacion_items")
    .delete()
    .eq("cotizacion_id", id);

  if (deleteError) {
    console.error("Error al reemplazar ítems:", deleteError.message);
    return {
      error: "No se pudieron actualizar los ítems. Intenta nuevamente.",
    };
  }

  const { error: itemsError } = await supabase
    .from("cotizacion_items")
    .insert(toItemRows(id, parsed.data.items));

  if (itemsError) {
    console.error("Error al guardar ítems:", itemsError.message);
    return {
      error: "No se pudieron actualizar los ítems. Intenta nuevamente.",
    };
  }

  revalidatePath("/cotizaciones");
  revalidatePath(`/cotizaciones/${id}`);
  redirect(`/cotizaciones/${id}`);
}

export type EnviarCotizacionResult = {
  error?: string;
  success?: boolean;
};

function formatFechaCorta(value: string) {
  const [anio, mes, dia] = value.slice(0, 10).split("-");
  return `${dia}-${mes}-${anio}`;
}

export async function enviarCotizacion(
  id: string
): Promise<EnviarCotizacionResult> {
  const supabase = await createClient();

  const { data: cotizacion, error: readError } = await supabase
    .from("cotizaciones")
    .select(
      `id, folio, estado, fecha_validez, flete, subtotal_neto, iva, total,
       token_aceptacion, notas, created_at,
       clientes(nombre, rut, correo, direccion),
       cotizacion_items(sku, descripcion, cantidad, precio, posicion)`
    )
    .eq("id", id)
    .single();

  if (readError || !cotizacion) {
    console.error("Error al leer cotización a enviar:", readError?.message);
    return { error: "No se encontró la cotización." };
  }

  const cliente = cotizacion.clientes as unknown as {
    nombre: string;
    rut: string | null;
    correo: string;
    direccion: string | null;
  } | null;
  const items = [
    ...(cotizacion.cotizacion_items as unknown as {
      sku: string;
      descripcion: string;
      cantidad: number;
      precio: number;
      posicion: number;
    }[]),
  ].sort((a, b) => a.posicion - b.posicion);

  if (cotizacion.estado !== "borrador") {
    return { error: "Solo se pueden enviar borradores" };
  }
  if (items.length === 0) {
    return { error: "La cotización no tiene ítems" };
  }
  if (!cliente?.correo?.trim()) {
    return { error: "El cliente no tiene correo" };
  }

  // El perfil es opcional: puede no existir todavía.
  const { data: perfil } = await supabase
    .from("perfiles")
    .select("razon_social, rut_empresa, direccion_empresa, telefono_empresa")
    .limit(1)
    .maybeSingle();

  const empresa = perfil?.razon_social || "Tulbless";
  const linkAceptar = `${APP_URL}/cotizacion/${cotizacion.token_aceptacion}`;

  try {
    const pdf = await generarPdfCotizacion({
      cotizacion: {
        folio: cotizacion.folio,
        created_at: cotizacion.created_at,
        fecha_validez: cotizacion.fecha_validez,
        flete: cotizacion.flete,
        subtotal_neto: cotizacion.subtotal_neto,
        iva: cotizacion.iva,
        total: cotizacion.total,
        notas: cotizacion.notas,
      },
      items,
      cliente,
      perfil,
    });

    await enviarCorreoCotizacion({
      para: cliente.correo,
      asunto: `Cotización ${cotizacion.folio} — ${empresa}`,
      react: createElement(CotizacionEmail, {
        folio: cotizacion.folio,
        clienteNombre: cliente.nombre,
        total: formatCLP(cotizacion.total),
        validaHasta: formatFechaCorta(cotizacion.fecha_validez),
        linkAceptar,
        empresa,
      }),
      adjuntoPdf: pdf,
      nombreAdjunto: `${cotizacion.folio}.pdf`,
    });
  } catch (error) {
    console.error("Error al enviar cotización por correo:", error);
    return {
      error:
        "No se pudo enviar el correo. Revisa la configuración de Resend e intenta de nuevo.",
    };
  }

  // El correo ya salió; recién ahora cambiamos el estado. El .eq("estado")
  // garantiza la transición atómica si otra pestaña la envió en paralelo.
  const { data: updated, error: updateError } = await supabase
    .from("cotizaciones")
    .update({ estado: "enviada", enviada_at: new Date().toISOString() })
    .eq("id", id)
    .eq("estado", "borrador")
    .select("id");

  if (updateError) {
    console.error(
      `Correo de cotización ${cotizacion.folio} enviado pero falló el cambio de estado:`,
      updateError.message
    );
    return {
      error:
        "El correo se envió pero no se pudo actualizar el estado. Intenta nuevamente.",
    };
  }
  if (!updated?.length) {
    console.error(
      `Correo de cotización ${cotizacion.folio} enviado pero ya no era borrador.`
    );
    return { error: "La cotización ya no es un borrador" };
  }

  revalidatePath("/cotizaciones");
  revalidatePath(`/cotizaciones/${id}`);
  return { success: true };
}

export async function duplicarCotizacion(id: string): Promise<void> {
  const supabase = await createClient();

  const { data: original, error: readError } = await supabase
    .from("cotizaciones")
    .select("cliente_id, flete, subtotal_neto, iva, total, notas")
    .eq("id", id)
    .single();

  if (readError || !original) {
    console.error("Error al leer cotización a duplicar:", readError?.message);
    return;
  }

  const { data: items, error: itemsReadError } = await supabase
    .from("cotizacion_items")
    .select("producto_id, sku, descripcion, cantidad, costo, precio")
    .eq("cotizacion_id", id)
    .order("posicion");

  if (itemsReadError) {
    console.error("Error al leer ítems a duplicar:", itemsReadError.message);
    return;
  }

  const { data: copia, error: insertError } = await supabase
    .from("cotizaciones")
    .insert({ ...original, estado: "borrador" })
    .select("id")
    .single();

  if (insertError || !copia) {
    console.error("Error al duplicar cotización:", insertError?.message);
    return;
  }

  if (items && items.length > 0) {
    const { error: itemsError } = await supabase
      .from("cotizacion_items")
      .insert(toItemRows(copia.id, items));

    if (itemsError) {
      console.error("Error al duplicar ítems:", itemsError.message);
      await supabase.from("cotizaciones").delete().eq("id", copia.id);
      return;
    }
  }

  revalidatePath("/cotizaciones");
  redirect(`/cotizaciones/${copia.id}`);
}
