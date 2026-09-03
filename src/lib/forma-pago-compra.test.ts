import { describe, expect, it } from "vitest";
import { montoDeuda, totalDeuda, type FormaPagoItem } from "./forma-pago-compra";

// Atajo: arma un item con plazo nulo, que es lo que no importa para la deuda.
function item(
  forma: FormaPagoItem["forma"],
  monto: number | null = null
): FormaPagoItem {
  return { forma, monto, plazo_dias: null };
}

describe("montoDeuda", () => {
  it("sin formas cargadas devuelve null (no se sabe, no es cero)", () => {
    expect(montoDeuda([], 100000)).toBeNull();
  });

  it("una sola forma de deuda sin monto debe el total del documento", () => {
    expect(montoDeuda([item("credito")], 100000)).toBe(100000);
    expect(montoDeuda([item("cheque")], 80000)).toBe(80000);
  });

  it("una sola forma ya pagada no debe nada", () => {
    expect(montoDeuda([item("contado")], 100000)).toBe(0);
    expect(montoDeuda([item("transferencia")], 100000)).toBe(0);
    expect(montoDeuda([item("debito")], 100000)).toBe(0);
    // "Otro" se trata como pagado: solo cheque y crédito son deuda.
    expect(montoDeuda([item("otro")], 100000)).toBe(0);
  });

  it("con varias formas suma solo las de deuda", () => {
    const items = [item("cheque", 50000), item("debito", 30000)];
    expect(montoDeuda(items, 80000)).toBe(50000);
  });

  it("suma cheque y crédito juntos", () => {
    const items = [
      item("cheque", 20000),
      item("credito", 30000),
      item("contado", 10000),
    ];
    expect(montoDeuda(items, 60000)).toBe(50000);
  });

  it("la única forma sin monto absorbe lo que falta del total", () => {
    // Débito $30.000 escrito; el crédito se lleva los $70.000 restantes.
    const items = [item("debito", 30000), item("credito")];
    expect(montoDeuda(items, 100000)).toBe(70000);
  });

  it("la forma sin monto absorbe el resto aunque sea ella la ya pagada", () => {
    const items = [item("credito", 40000), item("transferencia")];
    expect(montoDeuda(items, 100000)).toBe(40000);
  });

  it("no deja negativo el remanente cuando los montos se pasan del total", () => {
    const items = [item("debito", 120000), item("credito")];
    expect(montoDeuda(items, 100000)).toBe(0);
  });

  it("con dos o más montos sin indicar no reparte: solo suma lo escrito", () => {
    const items = [item("credito"), item("cheque"), item("debito", 10000)];
    expect(montoDeuda(items, 100000)).toBe(0);
  });

  it("con montos escritos que no cuadran con el total respeta lo escrito", () => {
    // Nadie completó la asignación; la deuda es lo declarado, no el faltante.
    const items = [item("credito", 10000), item("debito", 20000)];
    expect(montoDeuda(items, 100000)).toBe(10000);
  });
});

describe("totalDeuda", () => {
  it("suma las deudas y cuenta aparte las compras sin formas cargadas", () => {
    const r = totalDeuda([
      { items: [item("credito")], montoTotal: 100000 },
      { items: [item("contado")], montoTotal: 50000 },
      { items: [], montoTotal: 999999 },
      { items: [item("cheque", 20000), item("debito", 5000)], montoTotal: 25000 },
    ]);
    expect(r.total).toBe(120000);
    expect(r.pendientes).toBe(1);
  });

  it("sin compras da cero y nada pendiente", () => {
    expect(totalDeuda([])).toEqual({ total: 0, pendientes: 0 });
  });
});
