import { describe, it, expect } from "vitest";
import {
  construirEstadoCuenta,
  type EstadoPago,
  type VentaSiiEstadoCuenta,
} from "./estado-cuenta";

const venta = (
  id: string,
  tipo_doc: number,
  monto_total: number,
  fecha_emision: string | null = "2026-01-01",
  rut_cliente = "76109779-2",
  estado_nota: EstadoPago | null = null
): VentaSiiEstadoCuenta => ({
  id,
  tipo_doc,
  rut_cliente,
  folio: id,
  fecha_emision,
  monto_total,
  estado_nota,
});

describe("construirEstadoCuenta", () => {
  it("factura sin nota se asume pendiente y suma al saldo", () => {
    const { filas, totales } = construirEstadoCuenta("76.109.779-2", [
      venta("a", 33, 10000),
    ]);
    expect(filas[0].estadoPago).toBe("pendiente");
    expect(totales).toEqual({
      facturado: 10000,
      creditos: 0,
      pagado: 0,
      saldo: 10000,
    });
  });

  it("factura con nota pagada no suma al saldo", () => {
    const { totales } = construirEstadoCuenta("76109779-2", [
      venta("a", 33, 10000, "2026-01-01", "76109779-2", "pagada"),
    ]);
    expect(totales.pagado).toBe(10000);
    expect(totales.saldo).toBe(0);
  });

  it("nota de crédito resta del saldo y no lleva estado de pago", () => {
    const { filas, totales } = construirEstadoCuenta("76109779-2", [
      venta("a", 33, 10000),
      venta("b", 61, 3000),
    ]);
    const nc = filas.find((f) => f.id === "b")!;
    expect(nc.esCredito).toBe(true);
    expect(nc.estadoPago).toBeNull();
    expect(totales.creditos).toBe(3000);
    expect(totales.saldo).toBe(7000);
  });

  it("nota anulada se excluye de los totales", () => {
    const { totales } = construirEstadoCuenta("76109779-2", [
      venta("a", 33, 10000, "2026-01-01", "76109779-2", "anulada"),
    ]);
    expect(totales.facturado).toBe(0);
    expect(totales.saldo).toBe(0);
  });

  it("solo incluye documentos del RUT del cliente (formatos distintos)", () => {
    const { filas } = construirEstadoCuenta("76.109.779-2", [
      venta("a", 33, 10000, "2026-01-01", "76109779-2"),
      venta("z", 33, 5000, "2026-01-01", "99999999-9"),
    ]);
    expect(filas).toHaveLength(1);
    expect(filas[0].id).toBe("a");
  });

  it("cliente sin RUT devuelve estado vacío", () => {
    const { filas, totales } = construirEstadoCuenta(null, [venta("a", 33, 10000)]);
    expect(filas).toHaveLength(0);
    expect(totales.saldo).toBe(0);
  });

  it("crédito por defecto: vencimiento = emisión + 30 días", () => {
    const v = { ...venta("a", 33, 10000, "2026-01-01"), forma_pago: 2 };
    const { filas } = construirEstadoCuenta("76109779-2", [v], "2026-03-01");
    expect(filas[0].tipoPago).toBe("Crédito");
    expect(filas[0].plazoLabel).toBe("30 días");
    expect(filas[0].vencimiento).toBe("2026-01-31");
    expect(filas[0].vencida).toBe(true);
  });

  it("contado: vencimiento = emisión + 5 días y también vence", () => {
    const v = { ...venta("a", 33, 10000, "2026-02-01"), forma_pago: 1 };
    const { filas } = construirEstadoCuenta("76109779-2", [v], "2026-03-01");
    expect(filas[0].tipoPago).toBe("Contado");
    expect(filas[0].plazoLabel).toBe("5 días");
    expect(filas[0].vencimiento).toBe("2026-02-06");
    expect(filas[0].vencida).toBe(true);
  });

  it("usa TermPagoDias del DTE cuando existe", () => {
    const v = { ...venta("a", 33, 10000, "2026-01-01"), forma_pago: 2, term_pago_dias: 60 };
    const { filas } = construirEstadoCuenta("76109779-2", [v], "2026-03-01");
    expect(filas[0].plazoLabel).toBe("60 días");
    expect(filas[0].vencimiento).toBe("2026-03-02");
    expect(filas[0].vencida).toBe(false);
  });

  it("no vence si aún no llega la fecha o si la nota está pagada", () => {
    const reciente = { ...venta("a", 33, 10000, "2026-02-28"), forma_pago: 2 };
    const futura = construirEstadoCuenta("76109779-2", [reciente], "2026-03-01");
    expect(futura.filas[0].vencida).toBe(false);

    const pagada = construirEstadoCuenta(
      "76109779-2",
      [{ ...venta("a", 33, 10000, "2026-01-01", "76109779-2", "pagada"), forma_pago: 2 }],
      "2026-03-01"
    );
    expect(pagada.filas[0].vencida).toBe(false);
    expect(pagada.filas[0].estadoPago).toBe("pagada");
  });
});
