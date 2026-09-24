"use server";

import ExcelJS from "exceljs";
import { revalidatePath } from "next/cache";
import { SIN_PERMISO, checkPermiso } from "@/lib/auth/rol";
import { puedeVerCostos } from "@/lib/auth/permisos";
import { createClient } from "@/lib/supabase/server";
import {
  MAX_FILAS_IMPORT,
  leerEncabezados,
  validarFilas,
  type FilaCruda,
  type FilaValidada,
} from "@/lib/productos-import";

export type Previsualizacion =
  | { error: string }
  | { filas: FilaValidada[] };

// Valor plano de una celda de ExcelJS (fórmulas, texto enriquecido, links).
function valorCelda(v: ExcelJS.CellValue): unknown {
  if (v === null || v === undefined) return "";
  if (typeof v !== "object" || v instanceof Date) return v;
  if ("result" in v) return v.result ?? "";
  if ("richText" in v) return v.richText.map((t) => t.text).join("");
  if ("text" in v) return v.text;
  return "";
}

async function productosExistentes() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("productos")
    .select("sku, sku_proveedor, costo");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function previsualizarImportacion(
  formData: FormData
): Promise<Previsualizacion> {
  const perfil = await checkPermiso("productos", "escritura");
  if (!perfil) return { error: SIN_PERMISO };

  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { error: "Selecciona un archivo Excel (.xlsx)." };
  }

  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(await archivo.arrayBuffer());
  } catch {
    return { error: "No se pudo leer el archivo. Debe ser un Excel .xlsx." };
  }
  const hoja = wb.getWorksheet("Productos") ?? wb.worksheets[0];
  if (!hoja) return { error: "El archivo no tiene hojas." };

  const encabezados = leerEncabezados(
    (hoja.getRow(1).values as ExcelJS.CellValue[]).slice(1).map(valorCelda)
  );
  if (!encabezados.ok) {
    return {
      error: `Faltan columnas en la fila 1: ${encabezados.faltantes.join(", ")}. Usa la plantilla.`,
    };
  }
  const { indices } = encabezados;
  const celda = (row: ExcelJS.Row, i: number | undefined) =>
    i === undefined ? "" : valorCelda(row.getCell(i + 1).value);

  const crudas: FilaCruda[] = [];
  hoja.eachRow((row, n) => {
    if (n === 1) return;
    crudas.push({
      fila: n,
      sku: celda(row, indices.sku),
      sku_proveedor: celda(row, indices.sku_proveedor),
      descripcion: celda(row, indices.descripcion),
      costo: celda(row, indices.costo),
      precio: celda(row, indices.precio),
    });
  });
  if (crudas.length > MAX_FILAS_IMPORT) {
    return { error: `Máximo ${MAX_FILAS_IMPORT} filas por archivo.` };
  }

  try {
    const filas = validarFilas(crudas, await productosExistentes(), puedeVerCostos(perfil));
    if (filas.length === 0) return { error: "El archivo no tiene productos." };
    return { filas };
  } catch (e) {
    console.error("Error al previsualizar importación:", (e as Error).message);
    return { error: "No se pudieron cargar los productos. Intenta nuevamente." };
  }
}

// Recibe las filas de la vista previa y las vuelve a validar contra la base:
// el navegador no es confiable y el catálogo pudo cambiar entremedio.
export async function importarProductos(
  filas: FilaCruda[]
): Promise<{ error?: string; creados?: number; actualizados?: number }> {
  const perfil = await checkPermiso("productos", "escritura");
  if (!perfil) return { error: SIN_PERMISO };
  if (!Array.isArray(filas) || filas.length > MAX_FILAS_IMPORT) {
    return { error: "Datos inválidos." };
  }

  try {
    const validadas = validarFilas(filas, await productosExistentes(), puedeVerCostos(perfil));
    if (validadas.some((f) => f.estado === "error")) {
      return { error: "Hay filas con errores. Vuelve a subir el archivo." };
    }
    if (validadas.length === 0) return { error: "No hay productos para importar." };

    const supabase = await createClient();
    // Solo columnas de la plantilla: marca, unidad, proveedor y activo no se tocan.
    const { error } = await supabase
      .from("productos")
      .upsert(validadas.map((f) => f.datos!), { onConflict: "sku" });
    if (error) {
      console.error("Error al importar productos:", error.message);
      return {
        error:
          error.code === "23505"
            ? "Un SKU proveedor quedó repetido con otro producto. Revisa el archivo."
            : "No se pudo importar. Intenta nuevamente.",
      };
    }

    revalidatePath("/productos");
    return {
      creados: validadas.filter((f) => f.estado === "nuevo").length,
      actualizados: validadas.filter((f) => f.estado === "actualizar").length,
    };
  } catch (e) {
    console.error("Error al importar productos:", (e as Error).message);
    return { error: "No se pudo importar. Intenta nuevamente." };
  }
}
