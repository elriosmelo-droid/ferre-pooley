// Cobros de una nota de venta y la utilidad que arrastra cada peso cobrado.
//
// La regla de atribución es proporcional: si se cobró el 60% del documento,
// entró el 60% del margen. Es proporcional porque no hay forma de saber qué
// línea del documento pagó el cliente; cualquier otra regla sería inventada.
//
// Ojo con las bases: `total` es bruto (con IVA y con flete) porque es lo que el
// cliente debe y lo que se cobra, mientras que `margen` es neto y sin flete. La
// proporción se calcula bruto contra bruto y el resultado se aplica sobre el
// margen neto; los dos números no se dividen entre sí en ninguna parte.

export type Cobro = {
  id: string;
  fecha: string; // 'AAAA-MM-DD', cuándo entró el dinero
  monto: number;
  medio_pago: string | null;
  observacion: string | null;
};

// Tipos de DTE que fechan una venta: factura electrónica y factura exenta. Las
// notas de crédito y débito corrigen una venta anterior, no la constituyen, así
// que no deben arrastrarla a su propio mes.
const TIPOS_QUE_FECHAN = [33, 34];

export type FacturaFechable = {
  tipo_doc: number;
  fecha_emision: string | null;
};

// Fecha en que ocurrió la venta: la EMISIÓN de su factura más temprana, no el
// día en que se digitó la nota.
//
// La distinción no es cosmética. Cuando alguien se pone al día con la carga
// —en julio de 2026 se digitaron once notas de facturas emitidas en mayo y
// junio— fechar por la creación mete $112 millones en el mes equivocado y el
// sistema deja de cuadrar con el SII, que es lo que ve el contador.
//
// `creadaEnChile` (AAAA-MM-DD) es el respaldo para una nota que todavía no se
// factura: se cuenta el día que se cargó, y se mueve sola al mes de la factura
// cuando esta se emita.
//
// Misma regla que ya usan el dashboard y /conciliación; vive acá para que las
// cuatro pantallas compartan una definición en vez de tres parecidas.
export function fechaVentaNota(
  facturas: FacturaFechable[],
  creadaEnChile: string
): string {
  let temprana: string | null = null;
  for (const f of facturas) {
    if (!TIPOS_QUE_FECHAN.includes(f.tipo_doc) || !f.fecha_emision) continue;
    const dia = f.fecha_emision.slice(0, 10);
    if (!temprana || dia < temprana) temprana = dia;
  }
  return temprana ?? creadaEnChile;
}

export type NotaCobrable = {
  id: string;
  total: number; // bruto, con IVA y flete
  // Neto del documento (con flete, sin IVA). Es la base para mostrar cualquier
  // monto "sin IVA": el IVA se cobra y se entera al fisco, no es de la empresa.
  netoDoc: number;
  venta: number; // neto, sin flete ni IVA (sale de calcularMargen)
  margen: number; // neto, sin flete
  anulada: boolean;
  fechaVenta: string; // 'AAAA-MM-DD'
  // Sale de la factura del SII vinculada. null cuando la nota no tiene
  // factura: sin plazo no hay cómo saber cuándo vence.
  vencimiento: string | null;
  cobros: Cobro[];
};

export function cobrado(cobros: Cobro[]): number {
  return cobros.reduce((s, c) => s + c.monto, 0);
}

// Negativo = el cliente pagó de más y queda saldo a su favor. Se permite a
// propósito: bloquearlo obligaría a inventar cifras para poder guardar.
export function saldo(total: number, cobros: Cobro[]): number {
  return total - cobrado(cobros);
}

// Parte del margen que arrastra un abono. Con total en cero no hay proporción
// que calcular y devuelve cero en vez de dividir por cero.
export function utilidadDeAbono(
  margen: number,
  total: number,
  monto: number
): number {
  if (total <= 0) return 0;
  return Math.round((margen * monto) / total);
}

export function utilidadPercibida(nota: NotaCobrable): number {
  return nota.cobros.reduce(
    (s, c) => s + utilidadDeAbono(nota.margen, nota.total, c.monto),
    0
  );
}

// Vencida = pasó el vencimiento y todavía queda saldo. Una nota sin
// vencimiento (sin factura vinculada) nunca cuenta como vencida: no se sabe.
export function estaVencida(nota: NotaCobrable, hoy: string): boolean {
  if (!nota.vencimiento) return false;
  return nota.vencimiento < hoy && saldo(nota.total, nota.cobros) > 0;
}

export type ResumenVenta = {
  notas: number;
  vendido: number;
  venta: number; // neto, sin flete ni IVA: misma base que `utilidad`
  utilidad: number;
  cobrado: number;
  utilidadPercibida: number;
  porCobrar: number;
  porCobrarVencido: number;
  // Las mismas cifras de plata sin su IVA, para la vista "Sin IVA". La
  // utilidad no lleva versión: ya es neta.
  vendidoNeto: number;
  cobradoNeto: number;
  porCobrarNeto: number;
  porCobrarVencidoNeto: number;
};

// Lente "por venta": de lo vendido en el período, cuánto se ha cobrado. Las
// notas llegan ya filtradas por fecha de venta; acá solo se descartan las
// anuladas, que no son plata que se espere.
export function resumenPorVenta(
  notas: NotaCobrable[],
  hoy: string
): ResumenVenta {
  const r: ResumenVenta = {
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
  };
  for (const n of notas) {
    if (n.anulada) continue;
    const pagado = cobrado(n.cobros);
    const pendiente = n.total - pagado;
    r.notas += 1;
    r.vendido += n.total;
    r.vendidoNeto += n.netoDoc;
    r.venta += n.venta;
    r.utilidad += n.margen;
    r.cobrado += pagado;
    r.cobradoNeto += parteNeta(pagado, n.netoDoc, n.total);
    r.utilidadPercibida += utilidadPercibida(n);
    // Un saldo negativo no es plata por cobrar: no suma al pendiente.
    if (pendiente > 0) {
      const pendienteNeto = parteNeta(pendiente, n.netoDoc, n.total);
      r.porCobrar += pendiente;
      r.porCobrarNeto += pendienteNeto;
      if (estaVencida(n, hoy)) {
        r.porCobrarVencido += pendiente;
        r.porCobrarVencidoNeto += pendienteNeto;
      }
    }
  }
  return r;
}

// Genérico para que quien pase notas con campos extra (folio, cliente) los
// recupere tipados en el resultado, sin castear.
export type AbonoAtribuido<T extends NotaCobrable = NotaCobrable> = {
  nota: T;
  cobro: Cobro;
  utilidad: number;
};

// Los abonos que cayeron en el rango, cada uno con la utilidad que le toca.
// La atribución es abono por abono, no acumulada: si una nota se abona en dos
// meses, cada mes se lleva solo su parte.
export function abonosEnRango<T extends NotaCobrable>(
  notas: T[],
  desde: string,
  hasta: string
): AbonoAtribuido<T>[] {
  const salida: AbonoAtribuido<T>[] = [];
  for (const nota of notas) {
    if (nota.anulada) continue;
    for (const cobro of nota.cobros) {
      if (desde && cobro.fecha < desde) continue;
      if (hasta && cobro.fecha > hasta) continue;
      salida.push({
        nota,
        cobro,
        utilidad: utilidadDeAbono(nota.margen, nota.total, cobro.monto),
      });
    }
  }
  return salida;
}

export type ResumenCaja = {
  abonos: number;
  cobrado: number;
  cobradoNeto: number;
  utilidadPercibida: number;
};

// Lente "por caja": cuánta plata entró en el período y qué utilidad traía,
// sin importar cuándo se vendió.
export function resumenPorCaja(
  notas: NotaCobrable[],
  desde: string,
  hasta: string
): ResumenCaja {
  const dentro = abonosEnRango(notas, desde, hasta);
  return {
    abonos: dentro.length,
    cobrado: dentro.reduce((s, a) => s + a.cobro.monto, 0),
    cobradoNeto: dentro.reduce(
      (s, a) => s + parteNeta(a.cobro.monto, a.nota.netoDoc, a.nota.total),
      0
    ),
    utilidadPercibida: dentro.reduce((s, a) => s + a.utilidad, 0),
  };
}

// % de utilidad de un resumen: sobre `venta` (neta, sin flete ni IVA), NUNCA
// sobre `vendido` (bruto, con IVA y flete). Son bases distintas y dividir
// utilidad (neta) por vendido (bruto) da un porcentaje sin significado que
// además no coincide con el que muestra /notas-venta para las mismas notas
// (agregarMargen, en totals.ts, usa la misma base `venta`). Devuelve 0 si no
// hay venta, para no dividir por cero.
export function pctUtilidad(resumen: ResumenVenta): number {
  return resumen.venta > 0 ? (resumen.utilidad / resumen.venta) * 100 : 0;
}

// Un saldo pendiente junto al documento del que sale, para poder separar qué
// parte de ese saldo es IVA.
export type SaldoConDocumento = {
  monto: number; // parte del documento que está pendiente
  netoDoc: number; // neto del documento completo
  totalDoc: number; // total bruto del documento completo
};

export type DesgloseIva = {
  bruto: number;
  neto: number;
  iva: number;
};

// Separa un conjunto de saldos en su parte neta y su IVA.
//
// El IVA de una cuenta por cobrar no es plata de la empresa: se cobra al
// cliente y se entera al fisco. Lo mismo al revés en las cuentas por pagar,
// donde el IVA se recupera como crédito. Verlos juntos infla lo que uno cree
// que tiene o que debe.
//
// El reparto es proporcional al documento porque un saldo parcial no viene
// etiquetado: si se debe la mitad de una factura, se debe la mitad de su IVA.
// Documentos exentos no aportan IVA porque su neto es igual a su total.
//
// El IVA se calcula como resta y no como su propio redondeo, para que neto más
// IVA sea exactamente el bruto y no se pierda un peso por fila.
// Parte neta de un monto, en proporción a la del documento del que sale. Un
// saldo parcial no viene etiquetado: si se debe la mitad de una factura, se
// debe la mitad de su IVA. Sin total conocido devuelve el monto entero en vez
// de inventar un IVA.
export function parteNeta(
  monto: number,
  netoDoc: number,
  totalDoc: number
): number {
  if (totalDoc <= 0) return monto;
  return Math.round((monto * netoDoc) / totalDoc);
}

export function desglosarIva(saldos: SaldoConDocumento[]): DesgloseIva {
  const r: DesgloseIva = { bruto: 0, neto: 0, iva: 0 };
  for (const s of saldos) {
    const neto = parteNeta(s.monto, s.netoDoc, s.totalDoc);
    r.bruto += s.monto;
    r.neto += neto;
    r.iva += s.monto - neto;
  }
  return r;
}

// Fila del listado de notas reducida a lo que entra en los totales del pie.
export type FilaListado = {
  total: number; // bruto, con IVA y flete
  venta: number; // neto, sin flete
  costo: number;
  cobrado: number;
  anulada: boolean;
};

export type TotalesListado = {
  notas: number; // activas
  anuladas: number; // a la vista pero fuera de los totales
  total: number;
  cobrado: number;
  saldo: number;
  margen: number;
  pctMargen: number;
};

// Totales del pie del listado de notas de venta.
//
// Las anuladas NO suman a nada: no facturaron, no se cobran y no dejaron
// margen, así que sumarlas al total del mes afirma una venta que no existió.
// Se cuentan aparte para poder decir en pantalla que están a la vista pero no
// entran, y siguen visibles como filas.
//
// El porcentaje va sobre la venta NETA, no sobre el total bruto: son bases
// distintas y dividir una por otra da un número sin significado.
export function totalesListadoNotas(filas: FilaListado[]): TotalesListado {
  const r: TotalesListado = {
    notas: 0,
    anuladas: 0,
    total: 0,
    cobrado: 0,
    saldo: 0,
    margen: 0,
    pctMargen: 0,
  };
  let venta = 0;
  for (const f of filas) {
    if (f.anulada) {
      r.anuladas += 1;
      continue;
    }
    r.notas += 1;
    r.total += f.total;
    r.cobrado += f.cobrado;
    r.saldo += f.total - f.cobrado;
    venta += f.venta;
    r.margen += f.venta - f.costo;
  }
  r.pctMargen = venta > 0 ? (r.margen / venta) * 100 : 0;
  return r;
}

