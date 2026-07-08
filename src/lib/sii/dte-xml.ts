// Parser mínimo (regex) del XML de un DTE emitido (SetDTE/Documento) del SII.
// No valida firma; solo extrae los campos para mostrar el documento.

export type DteItem = {
  nombre: string;
  cantidad: number;
  unidad: string | null;
  precio: number;
  // Descuento de línea (DescuentoMonto). El precio es BRUTO y el monto es NETO
  // tras descuento, así que: cantidad*precio - descuento = monto.
  descuento: number;
  monto: number;
};

export type DteParsed = {
  tipoDte: number;
  folio: string;
  fchEmis: string;
  idDoc: {
    fmaPago: number | null;
    fchVenc: string | null;
    termPagoDias: number | null;
  };
  emisor: {
    rut: string;
    rznSoc: string;
    giro: string | null;
    dir: string | null;
    comuna: string | null;
    ciudad: string | null;
    correo: string | null;
  };
  receptor: {
    rut: string;
    rznSoc: string;
    giro: string | null;
    dir: string | null;
    comuna: string | null;
    ciudad: string | null;
  };
  items: DteItem[];
  montoNeto: number;
  iva: number;
  exento: number;
  total: number;
  // Bloque <TED>…</TED> crudo (timbre electrónico) para renderizar el PDF417.
  ted: string | null;
};

function tag(src: string, name: string): string | null {
  const m = src.match(new RegExp(`<${name}>([^<]*)</${name}>`));
  return m ? m[1].trim() : null;
}
function intTag(src: string, name: string): number {
  const v = tag(src, name);
  if (!v) return 0;
  const n = parseInt(v.replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}
function numTag(src: string, name: string): number {
  const v = tag(src, name);
  if (!v) return 0;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}
function block(src: string, name: string): string {
  const m = src.match(new RegExp(`<${name}[\\s>]([\\s\\S]*?)</${name}>`));
  return m ? m[1] : "";
}

export function parseDte(xml: string): DteParsed {
  const enc = block(xml, "Encabezado");
  const emisorB = block(enc, "Emisor");
  const recepB = block(enc, "Receptor");
  const totB = block(enc, "Totales");
  const idB = block(enc, "IdDoc");

  const items: DteItem[] = [];
  const re = /<Detalle>([\s\S]*?)<\/Detalle>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const d = m[1];
    items.push({
      nombre: tag(d, "NmbItem") ?? "",
      cantidad: numTag(d, "QtyItem"),
      unidad: tag(d, "UnmdItem"),
      precio: numTag(d, "PrcItem"),
      descuento: intTag(d, "DescuentoMonto"),
      monto: intTag(d, "MontoItem"),
    });
  }

  const fmaPago = intTag(idB, "FmaPago");
  const termPagoDias = intTag(idB, "TermPagoDias");

  return {
    tipoDte: intTag(idB, "TipoDTE"),
    folio: tag(idB, "Folio") ?? "",
    fchEmis: tag(idB, "FchEmis") ?? "",
    // Datos de pago del DTE (pueden faltar): FmaPago 1=contado 2=crédito 3=canje;
    // FchVenc = fecha de vencimiento; TermPagoDias = plazo en días.
    idDoc: {
      fmaPago: fmaPago || null,
      fchVenc: tag(idB, "FchVenc"),
      termPagoDias: termPagoDias || null,
    },
    emisor: {
      rut: tag(emisorB, "RUTEmisor") ?? "",
      rznSoc: tag(emisorB, "RznSoc") ?? "",
      giro: tag(emisorB, "GiroEmis"),
      dir: tag(emisorB, "DirOrigen"),
      comuna: tag(emisorB, "CmnaOrigen"),
      ciudad: tag(emisorB, "CiudadOrigen"),
      correo: tag(emisorB, "CorreoEmisor"),
    },
    receptor: {
      rut: tag(recepB, "RUTRecep") ?? "",
      rznSoc: tag(recepB, "RznSocRecep") ?? "",
      giro: tag(recepB, "GiroRecep"),
      dir: tag(recepB, "DirRecep"),
      comuna: tag(recepB, "CmnaRecep"),
      ciudad: tag(recepB, "CiudadRecep"),
    },
    items,
    montoNeto: intTag(totB, "MntNeto"),
    iva: intTag(totB, "IVA"),
    exento: intTag(totB, "MntExe"),
    total: intTag(totB, "MntTotal"),
    ted: xml.match(/<TED[\s\S]*?<\/TED>/)?.[0] ?? null,
  };
}
