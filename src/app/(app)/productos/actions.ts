"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type ProductoFormState = {
  error?: string;
  fieldErrors?: Partial<
    Record<"sku" | "descripcion" | "costo" | "precio" | "activo", string[]>
  >;
};

const productoSchema = z.object({
  sku: z.string().trim().min(1, "El SKU es obligatorio"),
  descripcion: z.string().trim().min(1, "La descripción es obligatoria"),
  costo: z.coerce
    .number("Ingresa un costo válido")
    .int("El costo debe ser un número entero")
    .min(0, "El costo debe ser mayor o igual a 0"),
  precio: z.coerce
    .number("Ingresa un precio válido")
    .int("El precio debe ser un número entero")
    .min(0, "El precio debe ser mayor o igual a 0"),
  activo: z.boolean(),
});

function parseProductoForm(formData: FormData) {
  return productoSchema.safeParse({
    sku: String(formData.get("sku") ?? ""),
    descripcion: String(formData.get("descripcion") ?? ""),
    costo: String(formData.get("costo") ?? ""),
    precio: String(formData.get("precio") ?? ""),
    activo: formData.get("activo") === "on",
  });
}

export async function crearProducto(
  _prevState: ProductoFormState,
  formData: FormData
): Promise<ProductoFormState> {
  const parsed = parseProductoForm(formData);
  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("productos").insert(parsed.data);

  if (error) {
    if (error.code === "23505") {
      return { fieldErrors: { sku: ["SKU ya existe"] } };
    }
    console.error("Error al crear producto:", error.message);
    return { error: "No se pudo guardar el producto. Intenta nuevamente." };
  }

  revalidatePath("/productos");
  redirect("/productos");
}

export async function actualizarProducto(
  id: string,
  _prevState: ProductoFormState,
  formData: FormData
): Promise<ProductoFormState> {
  const parsed = parseProductoForm(formData);
  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("productos")
    .update(parsed.data)
    .eq("id", id);

  if (error) {
    if (error.code === "23505") {
      return { fieldErrors: { sku: ["SKU ya existe"] } };
    }
    console.error("Error al actualizar producto:", error.message);
    return { error: "No se pudo actualizar el producto. Intenta nuevamente." };
  }

  revalidatePath("/productos");
  redirect("/productos");
}
