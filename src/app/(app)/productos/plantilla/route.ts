import ExcelJS from "exceljs";
import { checkPermiso } from "@/lib/auth/rol";
import { COLUMNAS_PLANTILLA } from "@/lib/productos-import";

// Plantilla .xlsx para la carga masiva de productos.
export async function GET() {
  const perfil = await checkPermiso("productos", "escritura");
  if (!perfil) return new Response("No autorizado", { status: 401 });

  const wb = new ExcelJS.Workbook();
  const hoja = wb.addWorksheet("Productos", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  hoja.columns = COLUMNAS_PLANTILLA.map((c) => ({
    header: c.titulo,
    key: c.campo,
    width: c.ancho,
  }));
  hoja.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  hoja.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } };
  hoja.addRow({
    sku: "MART-001",
    sku_proveedor: "STN-51-163",
    descripcion: "Martillo carpintero 16 oz (fila de ejemplo, bórrala)",
    costo: 8500,
    precio: 12990,
  });
  hoja.getColumn("costo").numFmt = "#,##0";
  hoja.getColumn("precio").numFmt = "#,##0";

  const ayuda = wb.addWorksheet("Instrucciones");
  ayuda.getColumn(1).width = 100;
  [
    "Cómo llenar la plantilla",
    "",
    "• Una fila por producto, en la hoja «Productos». No cambies los títulos de la fila 1.",
    "• SKU propio: obligatorio y único. Si ya existe en el sistema, el producto se actualiza.",
    "• SKU proveedor: opcional y único. Si lo dejas vacío en un producto existente, conserva el que tenía.",
    "• Descripción: obligatoria.",
    "• Costo y Precio venta: en pesos, sin decimales (ej. 12990).",
    "• Marca, unidad, proveedor y estado activo no se modifican con la carga masiva.",
    "• Antes de importar verás una vista previa con los errores de cada fila.",
  ].forEach((t, i) => {
    const r = ayuda.addRow([t]);
    if (i === 0) r.font = { bold: true, size: 13 };
  });

  const buf = await wb.xlsx.writeBuffer();
  return new Response(new Uint8Array(buf as ArrayBuffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="plantilla-productos.xlsx"',
    },
  });
}
