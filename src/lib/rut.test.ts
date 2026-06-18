import { describe, expect, it } from "vitest";
import { formatearRut } from "./rut";

describe("formatearRut", () => {
  it("formatea un RUT completo con dígito numérico", () => {
    expect(formatearRut("123456789")).toBe("12.345.678-9");
  });

  it("formatea con dígito verificador K", () => {
    expect(formatearRut("12345678k")).toBe("12.345.678-K");
  });

  it("ignora puntos y guiones ya escritos (re-formatea)", () => {
    expect(formatearRut("12.345.678-5")).toBe("12.345.678-5");
  });

  it("tolera entrada parcial mientras se escribe", () => {
    expect(formatearRut("12")).toBe("1-2");
    expect(formatearRut("1")).toBe("1");
    expect(formatearRut("")).toBe("");
  });

  it("descarta caracteres no válidos", () => {
    expect(formatearRut("9.876.543-2")).toBe("9.876.543-2");
    expect(formatearRut("abc7654321")).toBe("765.432-1");
  });
});
