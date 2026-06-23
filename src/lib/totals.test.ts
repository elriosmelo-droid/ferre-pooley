import { describe, expect, it } from "vitest";
import { calcularTotales } from "./totals";

describe("calcularTotales", () => {
  it("suma cantidad por (precio + flete unitario) y aplica IVA 19%", () => {
    const r = calcularTotales([
      { cantidad: 50, precio: 5890, flete: 500 },
      { cantidad: 30, precio: 4990, flete: 300 },
    ]);
    // 50*(6390) + 30*(5290) = 319500 + 158700 = 478200
    expect(r.subtotalBruto).toBe(478200);
    expect(r.descuento).toBe(0);
    expect(r.subtotalNeto).toBe(478200);
    expect(r.iva).toBe(Math.round(478200 * 0.19)); // 90858
    expect(r.total).toBe(478200 + Math.round(478200 * 0.19));
  });

  it("flete 0 equivale a solo precio", () => {
    const r = calcularTotales([{ cantidad: 2, precio: 1000, flete: 0 }]);
    expect(r.subtotalNeto).toBe(2000);
    expect(r.iva).toBe(380);
    expect(r.total).toBe(2380);
  });

  it("redondea IVA al peso", () => {
    const r = calcularTotales([{ cantidad: 1, precio: 99, flete: 0 }]);
    expect(r.iva).toBe(19); // 18.81 → 19
    expect(r.total).toBe(118);
  });

  it("aplica descuento porcentual solo sobre el precio, no sobre el flete", () => {
    const r = calcularTotales([
      { cantidad: 2, precio: 1000, flete: 200, descuento: 10 },
    ]);
    // descUnit = round(1000*10/100) = 100
    // bruto = 2*(1000+200) = 2400; descuento = 2*100 = 200
    // neto = 2200; iva = round(2200*0.19) = 418
    expect(r.subtotalBruto).toBe(2400);
    expect(r.descuento).toBe(200);
    expect(r.subtotalNeto).toBe(2200);
    expect(r.iva).toBe(418);
    expect(r.total).toBe(2618);
  });

  it("redondea el descuento unitario al peso", () => {
    const r = calcularTotales([
      { cantidad: 1, precio: 99, flete: 0, descuento: 15 },
    ]);
    // round(99*15/100) = round(14.85) = 15
    expect(r.descuento).toBe(15);
    expect(r.subtotalNeto).toBe(84);
  });

  it("sin items", () => {
    expect(calcularTotales([])).toEqual({
      subtotalBruto: 0,
      descuento: 0,
      subtotalNeto: 0,
      iva: 0,
      total: 0,
    });
  });
});
