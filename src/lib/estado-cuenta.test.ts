import { describe, it, expect } from "vitest";
import {
  construirEstadoCuenta,
  type VentaSiiEstadoCuenta,
  type NotaEstadoCuenta,
} from "./estado-cuenta";

const venta = (
  id: string,
  tipo_doc: number,
  monto_total: number,
  fecha_emision: string | null = "2026-01-01",
  rut_cliente = "76109779-2"
): VentaSiiEstadoCuenta => ({
  id,
  tipo_doc,
  rut_cliente,
  folio: id,
  fecha_emision,
  monto_total,
});

describe("construirEstadoCuenta", () => {
  it("factura sin nota se asume pendiente y suma al saldo", () => {
    const { filas, totales } = construirEstadoCuenta(
      "76.109.779-2",
      [venta("a", 33, 10000)],
      []
    );
    expect(filas[0].estadoPago).toBe("pendiente");
    expect(totales).toEqual({
      facturado: 10000,
      creditos: 0,
      pagado: 0,
      saldo: 10000,
    });
  });

  it("factura con nota pagada no suma al saldo", () => {
    const notas: NotaEstadoCuenta[] = [
      { venta_sii_id: "a", estado: "pagada" },
    ];
    const { totales } = construirEstadoCuenta(
      "76109779-2",
      [venta("a", 33, 10000)],
      notas
    );
    expect(totales.pagado).toBe(10000);
    expect(totales.saldo).toBe(0);
  });

  it("nota de crédito resta del saldo y no lleva estado de pago", () => {
    const { filas, totales } = construirEstadoCuenta(
      "76109779-2",
      [venta("a", 33, 10000), venta("b", 61, 3000)],
      []
    );
    const nc = filas.find((f) => f.id === "b")!;
    expect(nc.esCredito).toBe(true);
    expect(nc.estadoPago).toBeNull();
    expect(totales.creditos).toBe(3000);
    expect(totales.saldo).toBe(7000);
  });

  it("nota anulada se excluye de los totales", () => {
    const notas: NotaEstadoCuenta[] = [
      { venta_sii_id: "a", estado: "anulada" },
    ];
    const { totales } = construirEstadoCuenta(
      "76109779-2",
      [venta("a", 33, 10000)],
      notas
    );
    expect(totales.facturado).toBe(0);
    expect(totales.saldo).toBe(0);
  });

  it("solo incluye documentos del RUT del cliente (formatos distintos)", () => {
    const { filas } = construirEstadoCuenta(
      "76.109.779-2",
      [venta("a", 33, 10000, "2026-01-01", "76109779-2"), venta("z", 33, 5000, "2026-01-01", "99999999-9")],
      []
    );
    expect(filas).toHaveLength(1);
    expect(filas[0].id).toBe("a");
  });

  it("cliente sin RUT devuelve estado vacío", () => {
    const { filas, totales } = construirEstadoCuenta(null, [venta("a", 33, 10000)], []);
    expect(filas).toHaveLength(0);
    expect(totales.saldo).toBe(0);
  });

  it("marca vencida una factura pendiente con vencimiento pasado", () => {
    const v = { ...venta("a", 33, 10000), fecha_vencimiento: "2026-01-31", term_pago_dias: 30 };
    const { filas } = construirEstadoCuenta("76109779-2", [v], [], "2026-03-01");
    expect(filas[0].plazoLabel).toBe("30 días");
    expect(filas[0].vencida).toBe(true);
  });

  it("no marca vencida si aún no llega la fecha o si está pagada", () => {
    const v = { ...venta("a", 33, 10000), fecha_vencimiento: "2026-12-31" };
    const futura = construirEstadoCuenta("76109779-2", [v], [], "2026-03-01");
    expect(futura.filas[0].vencida).toBe(false);

    const pagada = construirEstadoCuenta(
      "76109779-2",
      [{ ...venta("a", 33, 10000), fecha_vencimiento: "2026-01-01" }],
      [{ venta_sii_id: "a", estado: "pagada" }],
      "2026-03-01"
    );
    expect(pagada.filas[0].vencida).toBe(false);
  });

  it("plazo Contado cuando forma de pago es 1", () => {
    const v = { ...venta("a", 33, 10000), forma_pago: 1 };
    const { filas } = construirEstadoCuenta("76109779-2", [v], []);
    expect(filas[0].plazoLabel).toBe("Contado");
  });
});
