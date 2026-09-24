"use server";

import { SIN_PERMISO, checkPermiso } from "@/lib/auth/rol";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { puedeVerCostos } from "@/lib/auth/permisos";

export type ProductoFormState = {
  error?: string;
  fieldErrors?: Partial<
    Record<
      | "sku"
      | "sku_proveedor"
      | "descripcion"
      | "marca"
      | "unidad"
      | "costo"
      | "precio"
      | "activo",
      string[]
    >
  >;
};

// Texto opcional: vacío se guarda como null.
const opcional = z
  .string()
  .trim()
  .transform((v) => v || null);

const productoSchema = z.object({
  sku: z.string().trim().min(1, "El SKU es obligatorio"),
  sku_proveedor: opcional,
  marca: opcional,
  unidad: opcional,
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

// Proveedores son solo de admin (RLS): a los demás el form no les muestra el
// campo y no se toca el que ya tiene el producto.
function leerProveedor(
  formData: FormData,
  esAdmin: boolean
): { proveedor_id?: string | null } {
  if (!esAdmin) return {};
  const id = String(formData.get("proveedor_id") ?? "").trim();
  return { proveedor_id: z.uuid().safeParse(id).success ? id : null };
}

// SKU duplicado: el mensaje indica cuál de los dos choca.
function errorDuplicado(message: string): ProductoFormState {
  return message.includes("sku_proveedor")
    ? { fieldErrors: { sku_proveedor: ["SKU proveedor ya está asignado a otro producto"] } }
    : { fieldErrors: { sku: ["SKU ya existe"] } };
}

function parseProductoForm(formData: FormData) {
  return productoSchema.safeParse({
    sku: String(formData.get("sku") ?? ""),
    sku_proveedor: String(formData.get("sku_proveedor") ?? ""),
    marca: String(formData.get("marca") ?? ""),
    unidad: String(formData.get("unidad") ?? ""),
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
  const perfil = await checkPermiso("productos", "escritura");
  if (!perfil) return { error: SIN_PERMISO };
  const parsed = parseProductoForm(formData);
  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }

  const supabase = await createClient();
  // Sin «ver costos» el producto nuevo queda con costo 0 (lo completa el admin).
  const { error } = await supabase.from("productos").insert({
    ...(puedeVerCostos(perfil) ? parsed.data : { ...parsed.data, costo: 0 }),
    ...leerProveedor(formData, perfil.rol === "admin"),
  });

  if (error) {
    if (error.code === "23505") return errorDuplicado(error.message);
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
  const perfil = await checkPermiso("productos", "escritura");
  if (!perfil) return { error: SIN_PERMISO };
  const parsed = parseProductoForm(formData);
  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }

  const supabase = await createClient();
  // Sin «ver costos» el form no trae costo: no se toca el que ya tiene.
  const { costo, ...sinCosto } = parsed.data;
  const { error } = await supabase
    .from("productos")
    .update({
      ...(puedeVerCostos(perfil) ? { ...sinCosto, costo } : sinCosto),
      ...leerProveedor(formData, perfil.rol === "admin"),
    })
    .eq("id", id);

  if (error) {
    if (error.code === "23505") return errorDuplicado(error.message);
    console.error("Error al actualizar producto:", error.message);
    return { error: "No se pudo actualizar el producto. Intenta nuevamente." };
  }

  revalidatePath("/productos");
  redirect("/productos");
}

// Los documentos que lo usaban quedan intactos (guardan copia de SKU y
// descripción); sus ítems solo pierden el vínculo al producto.
export async function eliminarProducto(id: string): Promise<{ error?: string }> {
  const perfil = await checkPermiso("productos", "escritura");
  if (!perfil) return { error: SIN_PERMISO };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("productos")
    .delete()
    .eq("id", id)
    .select("id");

  if (error || !data?.length) {
    console.error("Error al eliminar producto:", error?.message ?? "sin filas");
    return { error: "No se pudo eliminar el producto. Intenta nuevamente." };
  }

  revalidatePath("/productos");
  redirect("/productos");
}
