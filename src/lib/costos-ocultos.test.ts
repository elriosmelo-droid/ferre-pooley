import { describe, expect, it } from "vitest";
import { restaurarCostosOcultos } from "./costos-ocultos";

const item = (o: Partial<{ producto_id: string | null; sku: string; descripcion: string; costo: number; flete: number; precio: number }>) => ({
  producto_id: null,
  sku: "",
  descripcion: "x",
  costo: 0,
  flete: 0,
  precio: 100,
  ...o,
});

describe("restaurarCostosOcultos", () => {
  it("toma costo y flete del ítem previo con el mismo producto", () => {
    const r = restaurarCostosOcultos(
      [item({ producto_id: "p1", sku: "A", precio: 500 })],
      [{ producto_id: "p1", sku: "A", descripcion: "x", costo: 300, flete: 20 }],
      new Map([["p1", 999]])
    );
    expect(r[0]).toMatchObject({ costo: 300, flete: 20, precio: 500 });
  });

  it("calza por sku+descripción cuando el previo no guarda producto_id (notas)", () => {
    const r = restaurarCostosOcultos(
      [item({ producto_id: "p1", sku: "A", descripcion: "Tornillo" })],
      [{ sku: "A", descripcion: "Tornillo", costo: 50, flete: 5 }],
      new Map([["p1", 999]])
    );
    expect(r[0]).toMatchObject({ costo: 50, flete: 5 });
  });

  it("ítem nuevo de catálogo usa el costo del producto y flete 0", () => {
    const r = restaurarCostosOcultos(
      [item({ producto_id: "p2", sku: "B" })],
      [],
      new Map([["p2", 700]])
    );
    expect(r[0]).toMatchObject({ costo: 700, flete: 0 });
  });

  it("ítem libre nuevo queda con costo 0 y flete 0", () => {
    const r = restaurarCostosOcultos([item({ descripcion: "Servicio" })], [], new Map());
    expect(r[0]).toMatchObject({ costo: 0, flete: 0 });
  });

  it("ignora costo y flete enviados por el cliente", () => {
    const r = restaurarCostosOcultos(
      [item({ producto_id: "p2", costo: 1, flete: 9999 })],
      [],
      new Map([["p2", 700]])
    );
    expect(r[0]).toMatchObject({ costo: 700, flete: 0 });
  });

  it("líneas repetidas consumen los previos en orden", () => {
    const r = restaurarCostosOcultos(
      [item({ producto_id: "p1" }), item({ producto_id: "p1" })],
      [
        { producto_id: "p1", sku: "", descripcion: "x", costo: 10, flete: 1 },
        { producto_id: "p1", sku: "", descripcion: "x", costo: 20, flete: 2 },
      ],
      new Map([["p1", 999]])
    );
    expect(r.map((i) => i.costo)).toEqual([10, 20]);
    expect(r.map((i) => i.flete)).toEqual([1, 2]);
  });
});
