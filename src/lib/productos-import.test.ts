import { describe, expect, it } from "vitest";
import {
  COLUMNAS_PLANTILLA,
  leerEncabezados,
  parseMonto,
  validarFilas,
  type ProductoExistente,
} from "./productos-import";

const existentes: ProductoExistente[] = [
  { sku: "A-1", sku_proveedor: "PROV-1", costo: 100 },
  { sku: "A-2", sku_proveedor: null, costo: 200 },
];

const fila = (o: Partial<Record<string, unknown>> = {}) => ({
  fila: 2,
  sku: "N-1",
  sku_proveedor: "",
  descripcion: "Martillo",
  costo: 1000,
  precio: 1500,
  ...o,
});

describe("parseMonto", () => {
  it("acepta números y los redondea", () => {
    expect(parseMonto(1234)).toBe(1234);
    expect(parseMonto(10.6)).toBe(11);
  });
  it("acepta texto con formato chileno", () => {
    expect(parseMonto("$1.234")).toBe(1234);
    expect(parseMonto(" 12.500 ")).toBe(12500);
    expect(parseMonto("1234,5")).toBe(1235);
  });
  it("rechaza vacío, negativo o texto", () => {
    expect(parseMonto("")).toBeNull();
    expect(parseMonto(null)).toBeNull();
    expect(parseMonto(-5)).toBeNull();
    expect(parseMonto("abc")).toBeNull();
  });
});

describe("leerEncabezados", () => {
  it("ubica columnas por nombre sin importar mayúsculas, tildes ni orden", () => {
    const r = leerEncabezados(["precio venta", "DESCRIPCION", "Sku Propio", "costo", "SKU proveedor"]);
    expect(r).toEqual({ ok: true, indices: { precio: 0, descripcion: 1, sku: 2, costo: 3, sku_proveedor: 4 } });
  });
  it("acepta la plantilla tal cual", () => {
    expect(leerEncabezados(COLUMNAS_PLANTILLA.map((c) => c.titulo)).ok).toBe(true);
  });
  it("informa columnas faltantes", () => {
    const r = leerEncabezados(["SKU propio", "Descripción"]);
    expect(r).toEqual({ ok: false, faltantes: ["Costo", "Precio venta"] });
  });
  it("SKU proveedor es opcional", () => {
    expect(leerEncabezados(["SKU propio", "Descripción", "Costo", "Precio venta"]).ok).toBe(true);
  });
});

describe("validarFilas", () => {
  it("marca nuevos y actualizaciones", () => {
    const r = validarFilas([fila(), fila({ fila: 3, sku: "A-2" })], existentes, true);
    expect(r.map((x) => x.estado)).toEqual(["nuevo", "actualizar"]);
  });

  it("SKU proveedor vacío en un existente conserva el que tenía", () => {
    const [r] = validarFilas([fila({ sku: "A-1" })], existentes, true);
    expect(r.estado).toBe("actualizar");
    expect(r.datos?.sku_proveedor).toBe("PROV-1");
  });

  it("exige SKU, descripción, costo y precio válidos", () => {
    const r = validarFilas(
      [fila({ sku: "" }), fila({ fila: 3, descripcion: " " }), fila({ fila: 4, costo: "x" }), fila({ fila: 5, precio: -1 })],
      existentes,
      true
    );
    expect(r.map((x) => x.estado)).toEqual(["error", "error", "error", "error"]);
    expect(r[0].errores).toContain("SKU propio obligatorio");
    expect(r[2].errores).toContain("Costo inválido");
  });

  it("detecta SKU propio repetido dentro del archivo", () => {
    const r = validarFilas([fila(), fila({ fila: 3 })], existentes, true);
    expect(r[1].estado).toBe("error");
    expect(r[1].errores).toContain("SKU propio repetido en el archivo (fila 2)");
  });

  it("detecta SKU proveedor repetido en el archivo o asignado a otro producto", () => {
    const r = validarFilas(
      [fila({ sku_proveedor: "X" }), fila({ fila: 3, sku: "N-2", sku_proveedor: "x" }), fila({ fila: 4, sku: "N-3", sku_proveedor: "PROV-1" })],
      existentes,
      true
    );
    expect(r[1].errores).toContain("SKU proveedor repetido en el archivo (fila 2)");
    expect(r[2].errores).toContain("SKU proveedor ya asignado al producto A-1");
  });

  it("el mismo producto puede repetir su SKU proveedor", () => {
    const [r] = validarFilas([fila({ sku: "A-1", sku_proveedor: "PROV-1" })], existentes, true);
    expect(r.estado).toBe("actualizar");
  });

  it("sin ver costos ignora la columna costo", () => {
    const r = validarFilas([fila({ costo: "" }), fila({ fila: 3, sku: "A-2", costo: 999 })], existentes, false);
    expect(r[0].datos?.costo).toBe(0);
    expect(r[1].datos?.costo).toBe(200);
  });

  it("omite filas completamente vacías", () => {
    const r = validarFilas([fila({ sku: "", descripcion: "", costo: "", precio: "" })], existentes, true);
    expect(r).toEqual([]);
  });
});
