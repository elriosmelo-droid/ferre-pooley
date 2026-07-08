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
  plazoLabel: string; // "30 días" / "Contado" / "Crédito" / "—"
  vencimiento: string | null; // ISO
  vencida: boolean; // vencimiento < hoy y sigue pendiente
};

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
function plazoLabel(v: VentaSiiEstadoCuenta): string {
  if (v.forma_pago === 1) return "Contado";
  if (v.term_pago_dias) return `${v.term_pago_dias} días`;
  if (v.fecha_vencimiento) return "Crédito";
  return "—";
}

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
    const vencimiento = esCredito ? null : (v.fecha_vencimiento ?? null);
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
      plazoLabel: esCredito ? "—" : plazoLabel(v),
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
