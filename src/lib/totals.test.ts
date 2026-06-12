import { describe, expect, it } from "vitest";
import { calcularTotales } from "./totals";

describe("calcularTotales", () => {
  it("suma items, flete y aplica IVA 19%", () => {
    const r = calcularTotales(
      [
        { cantidad: 50, precio: 5890 },
        { cantidad: 30, precio: 4990 },
      ],
      25000
    );
    expect(r).toEqual({
      subtotalNeto: 444200,
      flete: 25000,
      iva: 89148,
      total: 558348,
    });
  });

  it("redondea IVA al peso", () => {
    const r = calcularTotales([{ cantidad: 1, precio: 99 }], 0);
    expect(r.iva).toBe(19); // 18.81 → 19
    expect(r.total).toBe(118);
  });

  it("sin items", () => {
    expect(calcularTotales([], 0)).toEqual({
      subtotalNeto: 0,
      flete: 0,
      iva: 0,
      total: 0,
    });
  });
});
