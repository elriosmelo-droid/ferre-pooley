import { normalizarRut } from "./rut";
import { TIPO_DOC_CORTO, esNotaCredito } from "./dte-doc";

export type EstadoPago = "pendiente" | "pagada" | "anulada";

export type VentaSiiEstadoCuenta = {
  id: string;
  tipo_doc: number;
  rut_cliente: string;
  folio: string;
  fecha_emision: string | null;
  monto_total: number;
  forma_pago?: number | null;
  term_pago_dias?: number | null;
  fecha_vencimiento?: string | null;
};

export type NotaEstadoCuenta = {
  venta_sii_id: string | null;
  estado: EstadoPago;
};

export type FilaEstadoCuenta = {
  id: string;
  fecha: string | null;
  tipoDoc: number;
  tipoLabel: string;
  folio: string;
  monto: number;
  esCredito: boolean;
  // null para notas de crédito (no aplica "pagada"); si no hay nota vinculada,
  // la factura/ND se asume "pendiente".
  estadoPago: EstadoPago | null;
  tipoPago: string; // "Contado" / "Crédito" / "Canje" / "—"
  plazoLabel: string; // "30 días" / "5 días" / "—"
  vencimiento: string | null; // ISO
  vencida: boolean; // vencimiento < hoy y sigue pendiente
};

// Plazo de pago en días. Muchas facturas no traen TermPagoDias en el DTE, así
// que se usa un default: contado = 5 días, crédito o desconocido = 30 días.
export function plazoDias(
  formaPago: number | null | undefined,
  termPagoDias: number | null | undefined
): number {
  if (termPagoDias && termPagoDias > 0) return termPagoDias;
  return formaPago === 1 ? 5 : 30;
}

function addDias(fechaISO: string, dias: number): string {
  const d = new Date(`${fechaISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

// Vencimiento = fecha de emisión + plazo. Todas las facturas/ND tienen
// vencimiento (incluido contado, a 5 días).
export function calcularVencimiento(
  fechaEmision: string | null,
  formaPago: number | null | undefined,
  termPagoDias: number | null | undefined
): string | null {
  if (!fechaEmision) return null;
  return addDias(fechaEmision.slice(0, 10), plazoDias(formaPago, termPagoDias));
}

export function tipoPagoLabel(formaPago: number | null | undefined): string {
  if (formaPago === 1) return "Contado";
  if (formaPago === 3) return "Canje";
  return "Crédito";
}

export type TotalesEstadoCuenta = {
  facturado: number; // facturas + ND no anuladas
  creditos: number; // notas de crédito (restan)
  pagado: number; // facturas/ND con nota pagada
  saldo: number; // facturado − creditos − pagado (negativo = saldo a favor)
};

export type EstadoCuenta = {
  filas: FilaEstadoCuenta[];
  totales: TotalesEstadoCuenta;
};

// Arma el estado de cuenta de un cliente a partir de sus documentos del SII y
// sus notas de venta. Fuente de verdad única para la página y el PDF.
export function construirEstadoCuenta(
  clienteRut: string | null,
  ventasSii: VentaSiiEstadoCuenta[],
  notas: NotaEstadoCuenta[],
  hoy?: string
): EstadoCuenta {
  const rutObjetivo = normalizarRut(clienteRut);

  // Estado de pago por documento SII (vía la nota vinculada).
  const estadoPorVenta = new Map<string, EstadoPago>();
  for (const n of notas) {
    if (n.venta_sii_id) estadoPorVenta.set(n.venta_sii_id, n.estado);
  }

  const docs = rutObjetivo
    ? ventasSii.filter((v) => normalizarRut(v.rut_cliente) === rutObjetivo)
    : [];

  // Más recientes primero.
  docs.sort((a, b) =>
    (b.fecha_emision ?? "").localeCompare(a.fecha_emision ?? "")
  );

  const filas: FilaEstadoCuenta[] = docs.map((v) => {
    const esCredito = esNotaCredito(v.tipo_doc);
    const estadoPago = esCredito
      ? null
      : (estadoPorVenta.get(v.id) ?? "pendiente");
    const vencimiento = esCredito
      ? null
      : calcularVencimiento(v.fecha_emision, v.forma_pago, v.term_pago_dias);
    const vencida =
      estadoPago === "pendiente" &&
      !!vencimiento &&
      !!hoy &&
      vencimiento < hoy;
    return {
      id: v.id,
      fecha: v.fecha_emision,
      tipoDoc: v.tipo_doc,
      tipoLabel: TIPO_DOC_CORTO[v.tipo_doc] ?? `Tipo ${v.tipo_doc}`,
      folio: v.folio,
      monto: v.monto_total,
      esCredito,
      estadoPago,
      tipoPago: esCredito ? "—" : tipoPagoLabel(v.forma_pago),
      plazoLabel: esCredito
        ? "—"
        : `${plazoDias(v.forma_pago, v.term_pago_dias)} días`,
      vencimiento,
      vencida,
    };
  });

  let facturado = 0;
  let creditos = 0;
  let pagado = 0;
  for (const f of filas) {
    if (f.esCredito) {
      creditos += f.monto;
      continue;
    }
    if (f.estadoPago === "anulada") continue; // no cuenta al saldo
    facturado += f.monto;
    if (f.estadoPago === "pagada") pagado += f.monto;
  }

  return {
    filas,
    totales: { facturado, creditos, pagado, saldo: facturado - creditos - pagado },
  };
}
