import { describe, expect, it } from "vitest";
import { conservarEntregas, resumenEntrega } from "./entregas";

describe("resumenEntrega", () => {
  it("cuenta ítems pendientes", () => {
    expect(resumenEntrega([{ entregado: true }, { entregado: false }, { entregado: false }])).toEqual({
      items: 3,
      pendientes: 2,
    });
  });
  it("sin ítems no hay pendientes", () => {
    expect(resumenEntrega([])).toEqual({ items: 0, pendientes: 0 });
  });
});

describe("conservarEntregas", () => {
  const previos = [
    { sku: "A", descripcion: "Martillo", entregado: true, entregado_at: "2026-09-01T10:00:00Z" },
    { sku: "B", descripcion: "Clavos", entregado: false, entregado_at: null },
    { sku: "A", descripcion: "Martillo", entregado: false, entregado_at: null },
  ];

  it("mantiene la marca de los ítems que siguen iguales (SKU + descripción)", () => {
    const r = conservarEntregas(
      [
        { sku: "B", descripcion: "Clavos" },
        { sku: "A", descripcion: "Martillo" },
        { sku: "C", descripcion: "Nuevo" },
      ],
      previos
    );
    expect(r.map((x) => x.entregado)).toEqual([false, true, false]);
    expect(r[1].entregado_at).toBe("2026-09-01T10:00:00Z");
    expect(r[2].entregado_at).toBeNull();
  });

  it("cada ítem previo se usa una sola vez", () => {
    const r = conservarEntregas(
      [
        { sku: "A", descripcion: "Martillo" },
        { sku: "A", descripcion: "Martillo" },
        { sku: "A", descripcion: "Martillo" },
      ],
      previos
    );
    expect(r.map((x) => x.entregado)).toEqual([true, false, false]);
  });

  it("compara sin distinguir mayúsculas ni espacios extremos", () => {
    const [r] = conservarEntregas([{ sku: "a ", descripcion: " martillo" }], previos);
    expect(r.entregado).toBe(true);
  });
});
