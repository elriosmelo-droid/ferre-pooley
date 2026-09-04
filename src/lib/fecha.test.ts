import { describe, expect, it } from "vitest";
import { ultimosMeses } from "./fecha";

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
