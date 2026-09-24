// Carga masiva de productos desde Excel: lectura de encabezados y validación
// fila por fila. Sin dependencias de servidor para poder testearla.

export type CampoImport = "sku" | "sku_proveedor" | "descripcion" | "costo" | "precio";

export const COLUMNAS_PLANTILLA: {
  campo: CampoImport;
  titulo: string;
  obligatoria: boolean;
  ancho: number;
}[] = [
  { campo: "sku", titulo: "SKU propio", obligatoria: true, ancho: 16 },
  { campo: "sku_proveedor", titulo: "SKU proveedor", obligatoria: false, ancho: 18 },
  { campo: "descripcion", titulo: "Descripción", obligatoria: true, ancho: 45 },
  { campo: "costo", titulo: "Costo", obligatoria: true, ancho: 12 },
  { campo: "precio", titulo: "Precio venta", obligatoria: true, ancho: 14 },
];

export const MAX_FILAS_IMPORT = 5000;

const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const TITULOS = new Map(COLUMNAS_PLANTILLA.map((c) => [normalizar(c.titulo), c.campo]));

export function leerEncabezados(
  celdas: unknown[]
):
  | { ok: true; indices: Partial<Record<CampoImport, number>> }
  | { ok: false; faltantes: string[] } {
  const indices: Partial<Record<CampoImport, number>> = {};
  celdas.forEach((c, i) => {
    const campo = TITULOS.get(normalizar(String(c ?? "")));
    if (campo && indices[campo] === undefined) indices[campo] = i;
  });
  const faltantes = COLUMNAS_PLANTILLA.filter(
    (c) => c.obligatoria && indices[c.campo] === undefined
  ).map((c) => c.titulo);
  return faltantes.length ? { ok: false, faltantes } : { ok: true, indices };
}

// Montos en CLP enteros. Acepta número o texto tipo "$1.234" (punto = miles).
export function parseMonto(v: unknown): number | null {
  if (typeof v === "number") {
    return Number.isFinite(v) && v >= 0 ? Math.round(v) : null;
  }
  const s = String(v ?? "")
    .replace(/[$\s]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  if (!s || !/^\d+(\.\d+)?$/.test(s)) return null;
  return Math.round(Number(s));
}

export type FilaCruda = {
  fila: number; // número de fila en la planilla, para los mensajes
  sku: unknown;
  sku_proveedor: unknown;
  descripcion: unknown;
  costo: unknown;
  precio: unknown;
};

export type ProductoExistente = {
  sku: string;
  sku_proveedor: string | null;
  costo: number;
};

export type DatosProducto = {
  sku: string;
  sku_proveedor: string | null;
  descripcion: string;
  costo: number;
  precio: number;
};

export type FilaValidada = {
  fila: number;
  sku: string;
  descripcion: string;
  estado: "nuevo" | "actualizar" | "error";
  errores: string[];
  datos?: DatosProducto;
};

const texto = (v: unknown) => String(v ?? "").trim();
const clave = (s: string) => s.toLowerCase();

export function validarFilas(
  filas: FilaCruda[],
  existentes: ProductoExistente[],
  verCostos: boolean
): FilaValidada[] {
  const porSku = new Map(existentes.map((p) => [clave(p.sku), p]));
  const duenoSkuProv = new Map(
    existentes
      .filter((p) => p.sku_proveedor)
      .map((p) => [clave(p.sku_proveedor!), p.sku])
  );
  const vistosSku = new Map<string, number>();
  const vistosProv = new Map<string, number>();
  const out: FilaValidada[] = [];

  for (const f of filas) {
    const sku = texto(f.sku);
    const skuProv = texto(f.sku_proveedor);
    const descripcion = texto(f.descripcion);
    const vacia =
      !sku && !skuProv && !descripcion && !texto(f.costo) && !texto(f.precio);
    if (vacia) continue;

    const errores: string[] = [];
    const existente = sku ? porSku.get(clave(sku)) : undefined;

    if (!sku) errores.push("SKU propio obligatorio");
    else if (vistosSku.has(clave(sku)))
      errores.push(`SKU propio repetido en el archivo (fila ${vistosSku.get(clave(sku))})`);
    else vistosSku.set(clave(sku), f.fila);

    if (skuProv) {
      const dueno = duenoSkuProv.get(clave(skuProv));
      if (vistosProv.has(clave(skuProv)))
        errores.push(`SKU proveedor repetido en el archivo (fila ${vistosProv.get(clave(skuProv))})`);
      else vistosProv.set(clave(skuProv), f.fila);
      if (dueno && clave(dueno) !== clave(sku))
        errores.push(`SKU proveedor ya asignado al producto ${dueno}`);
    }

    if (!descripcion) errores.push("Descripción obligatoria");

    // Sin «ver costos» la columna se ignora: nuevo queda en 0, existente conserva.
    const costo = verCostos ? parseMonto(f.costo) : (existente?.costo ?? 0);
    if (costo === null) errores.push("Costo inválido");
    const precio = parseMonto(f.precio);
    if (precio === null) errores.push("Precio inválido");

    out.push({
      fila: f.fila,
      sku,
      descripcion,
      errores,
      ...(errores.length
        ? { estado: "error" as const }
        : {
            estado: existente ? ("actualizar" as const) : ("nuevo" as const),
            datos: {
              sku: existente?.sku ?? sku,
              sku_proveedor: skuProv || existente?.sku_proveedor || null,
              descripcion,
              costo: costo!,
              precio: precio!,
            },
          }),
    });
  }
  return out;
}
