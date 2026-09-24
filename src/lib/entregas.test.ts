import { describe, expect, it } from "vitest";
import { conservarEntregas, estadoItem, resumenEntrega } from "./entregas";

describe("estadoItem", () => {
  it("distingue sin entregar, parcial y entregado", () => {
    expect(estadoItem({ cantidad: 10, cantidad_entregada: 0 })).toBe("pendiente");
    expect(estadoItem({ cantidad: 10, cantidad_entregada: 4 })).toBe("parcial");
    expect(estadoItem({ cantidad: 10, cantidad_entregada: 10 })).toBe("entregado");
  });
});

describe("resumenEntrega", () => {
  it("cuenta ítems por estado", () => {
    expect(
      resumenEntrega([
        { cantidad: 2, cantidad_entregada: 2 },
        { cantidad: 5, cantidad_entregada: 3 },
        { cantidad: 1, cantidad_entregada: 0 },
      ])
    ).toEqual({ items: 3, entregados: 1, parciales: 1, pendientes: 1, estado: "parcial" });
  });
  it("nota entregada, sin entregar o sin ítems", () => {
    expect(resumenEntrega([{ cantidad: 2, cantidad_entregada: 2 }]).estado).toBe("entregada");
    expect(resumenEntrega([{ cantidad: 2, cantidad_entregada: 0 }]).estado).toBe("pendiente");
    expect(resumenEntrega([]).estado).toBe("sin_items");
  });
  it("una nota con un ítem entregado y otro sin entregar es parcial", () => {
    expect(
      resumenEntrega([
        { cantidad: 2, cantidad_entregada: 2 },
        { cantidad: 1, cantidad_entregada: 0 },
      ]).estado
    ).toBe("parcial");
  });
});

describe("conservarEntregas", () => {
  const previos = [
    { sku: "A", descripcion: "Martillo", cantidad_entregada: 3, entregado_at: "2026-09-01T10:00:00Z" },
    { sku: "B", descripcion: "Clavos", cantidad_entregada: 0, entregado_at: null },
    { sku: "A", descripcion: "Martillo", cantidad_entregada: 0, entregado_at: null },
  ];

  it("mantiene lo entregado de los ítems que siguen iguales (SKU + descripción)", () => {
    const r = conservarEntregas(
      [
        { sku: "B", descripcion: "Clavos", cantidad: 5 },
        { sku: "A", descripcion: "Martillo", cantidad: 5 },
        { sku: "C", descripcion: "Nuevo", cantidad: 1 },
      ],
      previos
    );
    expect(r.map((x) => x.cantidad_entregada)).toEqual([0, 3, 0]);
    expect(r[1].entregado_at).toBe("2026-09-01T10:00:00Z");
    expect(r[2].entregado_at).toBeNull();
  });

  it("si la cantidad baja, lo entregado no la supera", () => {
    const [r] = conservarEntregas([{ sku: "A", descripcion: "Martillo", cantidad: 2 }], previos);
    expect(r.cantidad_entregada).toBe(2);
  });

  it("cada ítem previo se usa una sola vez", () => {
    const r = conservarEntregas(
      [
        { sku: "A", descripcion: "Martillo", cantidad: 5 },
        { sku: "A", descripcion: "Martillo", cantidad: 5 },
        { sku: "A", descripcion: "Martillo", cantidad: 5 },
      ],
      previos
    );
    expect(r.map((x) => x.cantidad_entregada)).toEqual([3, 0, 0]);
  });

  it("compara sin distinguir mayúsculas ni espacios extremos", () => {
    const [r] = conservarEntregas([{ sku: "a ", descripcion: " martillo", cantidad: 5 }], previos);
    expect(r.cantidad_entregada).toBe(3);
  });
});
