"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { TIPOS_PROVEEDOR, type TipoProveedor } from "./tipos";

export type SetTipoResult = { error?: string; success?: boolean };

// Asigna (o limpia con null) el tipo de un proveedor. Valida contra el catálogo
// para que coincida con el check de la tabla.
export async function setTipoProveedor(
  id: string,
  tipo: TipoProveedor | null
): Promise<SetTipoResult> {
  if (tipo !== null && !TIPOS_PROVEEDOR.includes(tipo)) {
    return { error: "Tipo de proveedor inválido" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("proveedores")
    .update({ tipo, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");

  if (error) {
    console.error("Error al asignar tipo de proveedor:", error.message);
    return { error: "No se pudo guardar el tipo. Intenta nuevamente." };
  }
  if (!data?.length) {
    return { error: "El proveedor ya no existe" };
  }

  revalidatePath("/proveedores");
  return { success: true };
}
