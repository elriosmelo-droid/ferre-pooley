// Tipos de DTE del SII que maneja la app y su efecto sobre los totales.
export const TIPO_DOC: Record<number, string> = {
  33: "Factura electrónica",
  34: "Factura exenta",
  56: "Nota de débito",
  61: "Nota de crédito",
};

export const TIPO_DOC_CORTO: Record<number, string> = {
  33: "Factura",
  34: "F. exenta",
  56: "ND",
  61: "NC",
};

export function etiquetaTipoDoc(tipo: number): string {
  return TIPO_DOC[tipo] ?? `Tipo ${tipo}`;
}

export function esNotaCredito(tipo: number): boolean {
  return tipo === 61;
}

// Signo del documento al sumar lo facturado: la nota de crédito descuenta.
export function signoDte(tipo: number): 1 | -1 {
  return esNotaCredito(tipo) ? -1 : 1;
}

// Tipos que el auto-vínculo puede enganchar solo: únicamente facturas. Las
// notas de crédito/débito se asocian a mano (requieren criterio).
export const TIPOS_AUTO_VINCULO = [33, 34];
