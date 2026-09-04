import { describe, expect, it } from "vitest";
import { ultimosMeses, diasEntre } from "./fecha";

describe("ultimosMeses", () => {
  it("devuelve el mes en curso y los anteriores, del más reciente al más viejo", () => {
    const m = ultimosMeses("2026-09-03", 3);
    expect(m.map((x) => x.clave)).toEqual(["2026-09", "2026-08", "2026-07"]);
    expect(m.map((x) => x.etiqueta)).toEqual(["sep 26", "ago 26", "jul 26"]);
  });

  it("el rango cubre el mes completo, del día 1 al último", () => {
    const [sep, ago, jul] = ultimosMeses("2026-09-03", 3);
    expect(sep).toMatchObject({ desde: "2026-09-01", hasta: "2026-09-30" });
    expect(ago).toMatchObject({ desde: "2026-08-01", hasta: "2026-08-31" });
    expect(jul).toMatchObject({ desde: "2026-07-01", hasta: "2026-07-31" });
  });

  it("cruza el año hacia atrás sin romperse", () => {
    const m = ultimosMeses("2026-01-15", 3);
    expect(m.map((x) => x.clave)).toEqual(["2026-01", "2025-12", "2025-11"]);
    expect(m.map((x) => x.etiqueta)).toEqual(["ene 26", "dic 25", "nov 25"]);
  });

  it("febrero de año bisiesto termina el 29", () => {
    const [feb] = ultimosMeses("2028-02-10", 1);
    expect(feb.hasta).toBe("2028-02-29");
  });

  it("febrero de año normal termina el 28", () => {
    const [feb] = ultimosMeses("2026-02-10", 1);
    expect(feb.hasta).toBe("2026-02-28");
  });

  it("el último día del mes no adelanta el mes", () => {
    // Un 31 puede correrse a otro mes si se calcula sumando meses a un Date.
    const m = ultimosMeses("2026-08-31", 2);
    expect(m.map((x) => x.clave)).toEqual(["2026-08", "2026-07"]);
  });

  it("pedir cero meses devuelve lista vacía", () => {
    expect(ultimosMeses("2026-09-03", 0)).toEqual([]);
  });
});

describe("diasEntre", () => {
  it("cuenta los días entre dos fechas", () => {
    expect(diasEntre("2026-09-03", "2026-09-13")).toBe(10);
  });

  it("es negativo si la fecha ya pasó", () => {
    expect(diasEntre("2026-09-13", "2026-09-03")).toBe(-10);
  });

  it("el mismo día son cero días", () => {
    expect(diasEntre("2026-09-03", "2026-09-03")).toBe(0);
  });

  it("cruza el cambio de mes y de año sin errores", () => {
    expect(diasEntre("2026-12-28", "2027-01-04")).toBe(7);
  });

  it("no se descuadra en el cambio de horario de verano de Chile", () => {
    // Si se calculara con horas locales, un día de 23 o 25 horas rompería la
    // división. Se calcula en UTC justamente para eso.
    expect(diasEntre("2026-09-05", "2026-09-08")).toBe(3);
    expect(diasEntre("2026-04-03", "2026-04-06")).toBe(3);
  });
});
