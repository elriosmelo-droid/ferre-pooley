import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseDte } from "./dte-xml";

// El fixture se guardó en UTF-8. En producción el XML llega del SII en
// ISO-8859-1 y mipe.ts lo decodifica con "latin1"; el parser es agnóstico al
// encoding (opera sobre el string ya decodificado).
const xml = readFileSync(join(__dirname, "__fixtures__/dte21.xml"), "utf8");

describe("parseDte", () => {
  it("extrae encabezado, receptor, items y totales del DTE real", () => {
    const d = parseDte(xml);
    expect(d.tipoDte).toBe(33);
    expect(d.folio).toBe("21");
    expect(d.fchEmis).toBe("2026-06-25");
    expect(d.emisor.rut).toBe("78400766-9");
    expect(d.emisor.rznSoc).toBe("TULBLESS SPA");
    expect(d.receptor.rut).toBe("77264557-0");
    expect(d.receptor.rznSoc).toBe("PRO LOGÍSTICA LOS RIOS LIMITADA");
    expect(d.montoNeto).toBe(14695200);
    expect(d.iva).toBe(2792088);
    expect(d.total).toBe(17487288);
    expect(d.items).toHaveLength(1);
    expect(d.items[0].nombre).toBe("TERCIADO ESTRUCTURAL");
    expect(d.items[0].cantidad).toBe(936);
    expect(d.items[0].precio).toBe(15700);
    expect(d.items[0].monto).toBe(14695200);
  });
});
