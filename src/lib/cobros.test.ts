import { describe, expect, it } from "vitest";
import {
  fechaVentaNota,
  desglosarIva,
  parteNeta,
  totalesListadoNotas,
  type FilaListado,
  cobrado,
  saldo,
  utilidadDeAbono,
  utilidadPercibida,
  estaVencida,
  resumenPorVenta,
  abonosEnRango,
  resumenPorCaja,
  pctUtilidad,
  type Cobro,
  type NotaCobrable,
} from "./cobros";
import { agregarMargen } from "./totals";

function cobro(fecha: string, monto: number, id = `${fecha}-${monto}`): Cobro {
  return { id, fecha, monto, medio_pago: null, observacion: null };
}

// Nota de $100.000 brutos (con IVA y flete), $84.000 de venta neta y $20.000
// de margen neto, vendida el 1 de junio.
function nota(over: Partial<NotaCobrable> = {}): NotaCobrable {
  return {
    id: "n1",
    total: 100000,
    netoDoc: 84034, // 100.000 brutos = 84.034 netos + IVA
    venta: 84000,
    margen: 20000,
    anulada: false,
    fechaVenta: "2026-06-01",
    vencimiento: "2026-07-01",
    cobros: [],
    ...over,
  };
}

describe("cobrado y saldo", () => {
  it("sin abonos el cobrado es cero y el saldo es el total", () => {
    expect(cobrado([])).toBe(0);
    expect(saldo(100000, [])).toBe(100000);
  });

  it("suma los abonos y descuenta del total", () => {
    const cs = [cobro("2026-06-10", 30000), cobro("2026-07-05", 20000)];
    expect(cobrado(cs)).toBe(50000);
    expect(saldo(100000, cs)).toBe(50000);
  });

  it("un cobro de más deja saldo negativo (a favor del cliente)", () => {
    expect(saldo(100000, [cobro("2026-06-10", 120000)])).toBe(-20000);
  });
});

describe("utilidadDeAbono", () => {
  it("atribuye el margen en proporción a lo cobrado", () => {
    // 60% del documento cobrado => 60% del margen.
    expect(utilidadDeAbono(20000, 100000, 60000)).toBe(12000);
  });

  it("un abono por el total trae el margen completo", () => {
    expect(utilidadDeAbono(20000, 100000, 100000)).toBe(20000);
  });

  it("redondea al peso", () => {
    // 20000 * 33333 / 100000 = 6666.6
    expect(utilidadDeAbono(20000, 100000, 33333)).toBe(6667);
  });

  it("con total cero devuelve cero en vez de dividir por cero", () => {
    expect(utilidadDeAbono(20000, 0, 5000)).toBe(0);
  });

  it("un margen negativo se atribuye igual, proporcional", () => {
    expect(utilidadDeAbono(-10000, 100000, 50000)).toBe(-5000);
  });
});

describe("utilidadPercibida", () => {
  it("suma la utilidad de cada abono", () => {
    const n = nota({
      cobros: [cobro("2026-06-10", 30000), cobro("2026-07-05", 30000)],
    });
    expect(utilidadPercibida(n)).toBe(12000);
  });

  it("sin abonos no hay utilidad percibida", () => {
    expect(utilidadPercibida(nota())).toBe(0);
  });
});

describe("estaVencida", () => {
  it("está vencida si pasó el vencimiento y queda saldo", () => {
    const n = nota({ cobros: [cobro("2026-06-10", 30000)] });
    expect(estaVencida(n, "2026-07-02")).toBe(true);
  });

  it("no está vencida si ya se pagó completa", () => {
    const n = nota({ cobros: [cobro("2026-06-10", 100000)] });
    expect(estaVencida(n, "2026-07-02")).toBe(false);
  });

  it("no está vencida antes del vencimiento", () => {
    expect(estaVencida(nota(), "2026-06-15")).toBe(false);
  });

  it("una nota sin vencimiento nunca cuenta como vencida", () => {
    expect(estaVencida(nota({ vencimiento: null }), "2027-01-01")).toBe(false);
  });
});

describe("resumenPorVenta", () => {
  it("agrega vendido, venta neta, utilidad, cobrado y por cobrar", () => {
    const r = resumenPorVenta(
      [
        nota({ id: "a", cobros: [cobro("2026-06-10", 60000)] }),
        nota({
          id: "b",
          total: 50000,
          venta: 40000,
          margen: 5000,
          cobros: [],
        }),
      ],
      "2026-06-15"
    );
    expect(r.notas).toBe(2);
    expect(r.vendido).toBe(150000);
    expect(r.venta).toBe(124000);
    expect(r.utilidad).toBe(25000);
    expect(r.cobrado).toBe(60000);
    expect(r.utilidadPercibida).toBe(12000);
    expect(r.porCobrar).toBe(90000);
  });

  it("descuenta las anuladas de todos los números, incluida la venta neta", () => {
    const r = resumenPorVenta(
      [
        nota({ id: "a" }),
        nota({ id: "b", anulada: true, venta: 999999 }),
      ],
      "2026-06-15"
    );
    expect(r.notas).toBe(1);
    expect(r.vendido).toBe(100000);
    expect(r.venta).toBe(84000);
    expect(r.utilidad).toBe(20000);
  });

  it("la venta neta acumulada es distinta del vendido bruto (no se dividen entre sí)", () => {
    // `vendido` es bruto (con IVA y flete) y `venta` es neta: el % de
    // utilidad va sobre `venta`, nunca sobre `vendido`.
    const r = resumenPorVenta(
      [nota({ id: "a" }), nota({ id: "b", total: 200000, venta: 168000 })],
      "2026-06-15"
    );
    expect(r.vendido).toBe(300000);
    expect(r.venta).toBe(252000);
    expect(r.vendido).not.toBe(r.venta);
  });

  it("una nota anulada por sí sola deja la venta neta en cero, aunque tenga venta propia", () => {
    const r = resumenPorVenta(
      [nota({ id: "a", anulada: true, venta: 50000 })],
      "2026-06-15"
    );
    expect(r.notas).toBe(0);
    expect(r.venta).toBe(0);
  });

  it("separa el por cobrar vencido del que está al día", () => {
    const r = resumenPorVenta(
      [
        nota({ id: "a", vencimiento: "2026-07-01" }), // vencida al 2026-08-01
        nota({ id: "b", vencimiento: "2026-09-01" }), // al día
      ],
      "2026-08-01"
    );
    expect(r.porCobrar).toBe(200000);
    expect(r.porCobrarVencido).toBe(100000);
  });

  it("sin notas devuelve todo en cero", () => {
    expect(resumenPorVenta([], "2026-08-01")).toEqual({
      notas: 0,
      vendido: 0,
      venta: 0,
      utilidad: 0,
      cobrado: 0,
      utilidadPercibida: 0,
      porCobrar: 0,
      porCobrarVencido: 0,
      vendidoNeto: 0,
      cobradoNeto: 0,
      porCobrarNeto: 0,
      porCobrarVencidoNeto: 0,
    });
  });
});

describe("abonosEnRango y resumenPorCaja", () => {
  it("toma solo los abonos con fecha dentro del rango", () => {
    const n = nota({
      cobros: [
        cobro("2026-05-31", 10000),
        cobro("2026-06-10", 30000),
        cobro("2026-06-30", 20000),
        cobro("2026-07-01", 40000),
      ],
    });
    const dentro = abonosEnRango([n], "2026-06-01", "2026-06-30");
    expect(dentro.map((a) => a.cobro.monto)).toEqual([30000, 20000]);
  });

  it("atribuye la utilidad abono por abono, no acumulada", () => {
    // La misma nota abonada en dos meses: cada mes se lleva lo suyo.
    const n = nota({
      cobros: [cobro("2026-06-10", 30000), cobro("2026-07-05", 70000)],
    });
    expect(resumenPorCaja([n], "2026-06-01", "2026-06-30")).toMatchObject({
      abonos: 1,
      cobrado: 30000,
      utilidadPercibida: 6000,
    });
    expect(resumenPorCaja([n], "2026-07-01", "2026-07-31")).toMatchObject({
      abonos: 1,
      cobrado: 70000,
      utilidadPercibida: 14000,
    });
  });

  it("ignora los abonos de notas anuladas", () => {
    const n = nota({ anulada: true, cobros: [cobro("2026-06-10", 30000)] });
    expect(resumenPorCaja([n], "2026-06-01", "2026-06-30")).toMatchObject({
      abonos: 0,
      cobrado: 0,
      utilidadPercibida: 0,
    });
  });

  it("un rango sin abonos devuelve todo en cero", () => {
    const n = nota({ cobros: [cobro("2026-06-10", 30000)] });
    expect(resumenPorCaja([n], "2026-01-01", "2026-01-31")).toMatchObject({
      abonos: 0,
      cobrado: 0,
      utilidadPercibida: 0,
    });
  });
});

describe("pctUtilidad", () => {
  it("calcula el % de utilidad sobre la venta neta", () => {
    const r = resumenPorVenta([nota({ id: "a" })], "2026-06-15");
    // venta neta 84.000, margen 20.000 => 20.000 / 84.000 ≈ 23,81%
    expect(pctUtilidad(r)).toBeCloseTo((20000 / 84000) * 100);
  });

  it("sin venta devuelve 0 en vez de dividir por cero", () => {
    expect(pctUtilidad({ notas: 0, vendido: 0, venta: 0, utilidad: 0, cobrado: 0, utilidadPercibida: 0, porCobrar: 0, porCobrarVencido: 0, vendidoNeto: 0, cobradoNeto: 0, porCobrarNeto: 0, porCobrarVencidoNeto: 0 })).toBe(0);
  });

  // Regresión: el % de utilidad debe ir sobre `venta` (neta, sin flete ni
  // IVA), NUNCA sobre `vendido` (bruto). Antes se usaba `vendido` por error y
  // el porcentaje resultante no significaba nada. Este caso arma un resumen
  // donde `venta` y `vendido` son distintos a propósito (venta neta 1.000.000,
  // vendido bruto 1.190.000, misma utilidad) y afirma el porcentaje que
  // corresponde a la venta neta: si alguien vuelve a usar `vendido`, este test
  // falla.
  it("usa la venta neta y no el vendido bruto (protege contra el bug del % sin significado)", () => {
    const r = {
      notas: 1,
      vendido: 1190000, // bruto: venta neta + IVA (1.000.000 * 1.19)
      venta: 1000000, // neto, sin flete ni IVA
      utilidad: 200000,
      cobrado: 0,
      utilidadPercibida: 0,
      porCobrar: 0,
      porCobrarVencido: 0,
      vendidoNeto: 1000000,
      cobradoNeto: 0,
      porCobrarNeto: 0,
      porCobrarVencidoNeto: 0,
    };
    expect(pctUtilidad(r)).toBe(20); // 200.000 / 1.000.000 (venta), no / 1.190.000 (vendido)
  });

  it("coincide con el % que muestra /notas-venta para el mismo conjunto de notas (agregarMargen)", () => {
    const notas = [
      { venta: 84000, costo: 64000 }, // margen 20.000
      { venta: 168000, costo: 130000 }, // margen 38.000
    ];
    const margenTotales = agregarMargen(notas);

    const r = resumenPorVenta(
      [
        nota({ id: "a", venta: 84000, margen: 20000 }),
        nota({ id: "b", venta: 168000, margen: 38000, total: 200000 }),
      ],
      "2026-06-15"
    );

    expect(pctUtilidad(r)).toBeCloseTo(margenTotales.pct);
  });
});

describe("fechaVentaNota", () => {
  const creada = "2026-07-20"; // día en que se digitó la nota

  it("usa la emisión de la factura, no la fecha en que se cargó la nota", () => {
    // El caso que motivó esto: notas digitadas en julio para poner al día
    // facturas emitidas en junio. La venta es de junio.
    expect(
      fechaVentaNota([{ tipo_doc: 33, fecha_emision: "2026-06-15" }], creada)
    ).toBe("2026-06-15");
  });

  it("con varias facturas toma la más temprana", () => {
    expect(
      fechaVentaNota(
        [
          { tipo_doc: 33, fecha_emision: "2026-06-20" },
          { tipo_doc: 33, fecha_emision: "2026-06-15" },
          { tipo_doc: 34, fecha_emision: "2026-06-18" },
        ],
        creada
      )
    ).toBe("2026-06-15");
  });

  it("las notas de crédito no fechan la venta", () => {
    // Una NC anterior a la factura no debe arrastrar la venta a su mes.
    expect(
      fechaVentaNota(
        [
          { tipo_doc: 61, fecha_emision: "2026-05-01" },
          { tipo_doc: 33, fecha_emision: "2026-06-15" },
        ],
        creada
      )
    ).toBe("2026-06-15");
  });

  it("las notas de débito tampoco fechan la venta", () => {
    expect(
      fechaVentaNota([{ tipo_doc: 56, fecha_emision: "2026-05-01" }], creada)
    ).toBe(creada);
  });

  it("sin facturas cae a la fecha en que se cargó la nota", () => {
    expect(fechaVentaNota([], creada)).toBe(creada);
  });

  it("ignora facturas sin fecha de emisión", () => {
    expect(
      fechaVentaNota(
        [
          { tipo_doc: 33, fecha_emision: null },
          { tipo_doc: 33, fecha_emision: "2026-06-15" },
        ],
        creada
      )
    ).toBe("2026-06-15");
  });

  it("con solo facturas sin fecha cae a la fecha de carga", () => {
    expect(
      fechaVentaNota([{ tipo_doc: 33, fecha_emision: null }], creada)
    ).toBe(creada);
  });

  it("recorta la fecha de emisión a AAAA-MM-DD si viene con hora", () => {
    expect(
      fechaVentaNota(
        [{ tipo_doc: 33, fecha_emision: "2026-06-15T00:00:00Z" }],
        creada
      )
    ).toBe("2026-06-15");
  });
});

describe("totalesListadoNotas", () => {
  // Fila del listado reducida a lo que entra en los totales.
  const fila = (over: Partial<FilaListado> = {}): FilaListado => ({
    total: 100000,
    venta: 80000,
    costo: 60000,
    cobrado: 0,
    anulada: false,
    ...over,
  });

  it("suma total, cobrado, saldo y margen de las notas activas", () => {
    const r = totalesListadoNotas([
      fila({ cobrado: 30000 }),
      fila({ total: 50000, venta: 40000, costo: 25000, cobrado: 50000 }),
    ]);
    expect(r.notas).toBe(2);
    expect(r.total).toBe(150000);
    expect(r.cobrado).toBe(80000);
    expect(r.saldo).toBe(70000);
    expect(r.margen).toBe(35000); // (80000−60000) + (40000−25000)
    expect(r.pctMargen).toBeCloseTo((35000 / 120000) * 100, 6);
  });

  it("NO cuenta las anuladas en ningún total", () => {
    // La regresión que motivó esto: el pie mostraba $135.688.632 en julio
    // porque sumaba una nota anulada de $14.844.060, mientras /finanzas
    // mostraba $120.844.572. Dos pantallas, dos cifras para el mismo mes.
    const r = totalesListadoNotas([
      fila(),
      fila({ total: 999999, venta: 999999, costo: 0, cobrado: 999999, anulada: true }),
    ]);
    expect(r.notas).toBe(1);
    expect(r.total).toBe(100000);
    expect(r.cobrado).toBe(0);
    expect(r.saldo).toBe(100000);
    expect(r.margen).toBe(20000);
  });

  it("cuenta aparte cuántas anuladas quedaron a la vista", () => {
    const r = totalesListadoNotas([
      fila(),
      fila({ anulada: true }),
      fila({ anulada: true }),
    ]);
    expect(r.anuladas).toBe(2);
    expect(r.notas).toBe(1);
  });

  it("un saldo negativo (pagó de más) resta del saldo total", () => {
    const r = totalesListadoNotas([
      fila({ cobrado: 120000 }),
      fila({ cobrado: 0 }),
    ]);
    expect(r.saldo).toBe(80000); // −20000 + 100000
  });

  it("sin filas devuelve todo en cero sin dividir por cero", () => {
    expect(totalesListadoNotas([])).toEqual({
      notas: 0,
      anuladas: 0,
      total: 0,
      cobrado: 0,
      saldo: 0,
      margen: 0,
      pctMargen: 0,
    });
  });

  it("solo anuladas: todo en cero pero las cuenta", () => {
    const r = totalesListadoNotas([fila({ anulada: true })]);
    expect(r.notas).toBe(0);
    expect(r.anuladas).toBe(1);
    expect(r.total).toBe(0);
    expect(r.pctMargen).toBe(0);
  });
});

describe("desglosarIva", () => {
  it("reparte un saldo entre neto e IVA según la proporción del documento", () => {
    // Documento de $119.000 = $100.000 neto + $19.000 IVA. Si se debe la
    // mitad, la mitad de esa deuda es IVA que habrá que enterar al fisco.
    const r = desglosarIva([
      { monto: 59500, netoDoc: 100000, totalDoc: 119000 },
    ]);
    expect(r.bruto).toBe(59500);
    expect(r.neto).toBe(50000);
    expect(r.iva).toBe(9500);
  });

  it("el neto y el IVA siempre suman el bruto, sin perder pesos al redondear", () => {
    const r = desglosarIva([
      { monto: 33333, netoDoc: 100000, totalDoc: 119000 },
      { monto: 7, netoDoc: 3, totalDoc: 4 },
    ]);
    expect(r.neto + r.iva).toBe(r.bruto);
  });

  it("suma varios documentos con proporciones distintas", () => {
    const r = desglosarIva([
      { monto: 119000, netoDoc: 100000, totalDoc: 119000 }, // afecto
      { monto: 50000, netoDoc: 50000, totalDoc: 50000 }, // exento, sin IVA
    ]);
    expect(r.bruto).toBe(169000);
    expect(r.neto).toBe(150000);
    expect(r.iva).toBe(19000);
  });

  it("un documento exento no aporta IVA", () => {
    const r = desglosarIva([{ monto: 50000, netoDoc: 50000, totalDoc: 50000 }]);
    expect(r.iva).toBe(0);
    expect(r.neto).toBe(50000);
  });

  it("con total del documento en cero no divide por cero", () => {
    const r = desglosarIva([{ monto: 1000, netoDoc: 0, totalDoc: 0 }]);
    expect(r.bruto).toBe(1000);
    expect(r.neto).toBe(1000); // sin proporción conocida, todo se trata como neto
    expect(r.iva).toBe(0);
  });

  it("sin filas devuelve todo en cero", () => {
    expect(desglosarIva([])).toEqual({ bruto: 0, neto: 0, iva: 0 });
  });
});

describe("parteNeta", () => {
  it("saca la parte neta de un monto según la proporción del documento", () => {
    expect(parteNeta(119000, 100000, 119000)).toBe(100000);
    expect(parteNeta(59500, 100000, 119000)).toBe(50000);
  });

  it("un documento exento devuelve el monto completo", () => {
    expect(parteNeta(50000, 50000, 50000)).toBe(50000);
  });

  it("con total en cero devuelve el monto sin inventar IVA", () => {
    expect(parteNeta(1000, 0, 0)).toBe(1000);
  });

  it("redondea al peso", () => {
    expect(parteNeta(1000, 100000, 119000)).toBe(840); // 840,3
  });
});

describe("resumenPorVenta en versión neta", () => {
  const nota = (over: Partial<NotaCobrable> = {}): NotaCobrable => ({
    id: "n1",
    total: 119000,
    netoDoc: 100000,
    venta: 100000,
    margen: 20000,
    anulada: false,
    fechaVenta: "2026-06-01",
    vencimiento: "2026-07-01",
    cobros: [],
    ...over,
  });

  it("acumula vendido, cobrado y por cobrar también sin IVA", () => {
    const r = resumenPorVenta(
      [
        nota({
          cobros: [
            {
              id: "a",
              fecha: "2026-06-10",
              monto: 59500,
              medio_pago: null,
              observacion: null,
            },
          ],
        }),
      ],
      "2026-06-15"
    );
    expect(r.vendido).toBe(119000);
    expect(r.vendidoNeto).toBe(100000);
    expect(r.cobrado).toBe(59500);
    expect(r.cobradoNeto).toBe(50000);
    expect(r.porCobrar).toBe(59500);
    expect(r.porCobrarNeto).toBe(50000);
  });

  it("las anuladas tampoco suman a las versiones netas", () => {
    const r = resumenPorVenta([nota({ anulada: true })], "2026-06-15");
    expect(r.vendidoNeto).toBe(0);
    expect(r.porCobrarNeto).toBe(0);
  });
});
