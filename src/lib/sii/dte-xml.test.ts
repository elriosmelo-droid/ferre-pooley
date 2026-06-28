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
    expect(d.items[0].descuento).toBe(0);
  });

  it("extrae el descuento de línea (DescuentoMonto) y reconcilia cant*precio - desc = monto", () => {
    // DTE con descuento por línea (caso MELON: PrcItem bruto, MontoItem neto).
    const conDesc = `<?xml version="1.0" encoding="ISO-8859-1"?>
<SetDTE><DTE version="1.0"><Documento ID="x">
  <Encabezado>
    <IdDoc><TipoDTE>33</TipoDTE><Folio>1080115</Folio><FchEmis>2026-06-18</FchEmis></IdDoc>
    <Emisor><RUTEmisor>90209000-3</RUTEmisor><RznSoc>MELON S.A.</RznSoc></Emisor>
    <Receptor><RUTRecep>78400766-9</RUTRecep><RznSocRecep>TULBLESS SPA</RznSocRecep></Receptor>
    <Totales><MntNeto>1134000</MntNeto><IVA>215460</IVA><MntTotal>1349460</MntTotal></Totales>
  </Encabezado>
  <Detalle>
    <NroLinDet>1</NroLinDet><NmbItem>EXTRA SACO 25 SOLUBLE FILM</NmbItem>
    <QtyItem>360</QtyItem><PrcItem>4725</PrcItem>
    <DescuentoPct>33.33</DescuentoPct><DescuentoMonto>567000</DescuentoMonto>
    <MontoItem>1134000</MontoItem>
  </Detalle>
</Documento></DTE></SetDTE>`;
    const d = parseDte(conDesc);
    const it = d.items[0];
    expect(it.precio).toBe(4725);
    expect(it.descuento).toBe(567000);
    expect(it.monto).toBe(1134000);
    // El bruto menos el descuento debe dar el monto neto de la línea.
    expect(it.cantidad * it.precio - it.descuento).toBe(it.monto);
  });
});
