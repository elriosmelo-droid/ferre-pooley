import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import bwipjs from "bwip-js/node";
import { formatCLP } from "@/lib/money";
import type { DteParsed } from "@/lib/sii/dte-xml";
import { LOGO_DATA_URI } from "./logo-data";

const TIPO_DOC: Record<number, string> = {
  33: "FACTURA ELECTRÓNICA",
  34: "FACTURA NO AFECTA O EXENTA ELECTRÓNICA",
  56: "NOTA DE DÉBITO ELECTRÓNICA",
  61: "NOTA DE CRÉDITO ELECTRÓNICA",
};

// Genera el timbre electrónico (PDF417) a partir del bloque <TED> del DTE.
// Devuelve un data URI PNG o null si no hay TED / falla.
async function timbrePng(ted: string | null): Promise<string | null> {
  if (!ted) return null;
  try {
    // columns/eclevel/padding son opciones válidas de bwipp pero no están en los
    // tipos de RenderOptions; se castea al tipo del parámetro.
    const opts = {
      bcid: "pdf417",
      text: ted,
      scale: 2,
      columns: 18,
      eclevel: 5,
      paddingwidth: 2,
      paddingheight: 2,
    } as Parameters<typeof bwipjs.toBuffer>[0];
    const png = await bwipjs.toBuffer(opts);
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return null;
  }
}

const s = StyleSheet.create({
  page: { padding: 28, fontSize: 8.5, color: "#0f172a", fontFamily: "Helvetica" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  emisor: { flex: 1, paddingRight: 12 },
  logo: { width: 120, marginBottom: 4 },
  rzn: { fontFamily: "Helvetica-Bold", fontSize: 12 },
  line: { fontSize: 8, color: "#334155", marginTop: 1 },
  docBox: { borderWidth: 2, borderColor: "#dc2626", borderRadius: 4, padding: 8, width: 210, alignItems: "center" },
  docRut: { color: "#dc2626", fontFamily: "Helvetica-Bold", fontSize: 11 },
  docTipo: { color: "#dc2626", fontFamily: "Helvetica-Bold", fontSize: 9, textAlign: "center", marginTop: 3 },
  docFolio: { color: "#dc2626", fontFamily: "Helvetica-Bold", fontSize: 13, marginTop: 3 },
  docSii: { fontSize: 7.5, color: "#64748b", marginTop: 3 },
  fechaBox: { alignSelf: "flex-end", marginTop: 4, width: 210, alignItems: "center" },
  recep: { marginTop: 14, borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 4, padding: 8 },
  recepRow: { flexDirection: "row", justifyContent: "space-between" },
  bold: { fontFamily: "Helvetica-Bold" },
  label: { color: "#64748b", fontSize: 8 },
  th: { flexDirection: "row", backgroundColor: "#1e293b", paddingVertical: 5, paddingHorizontal: 6, marginTop: 14 },
  thText: { color: "#ffffff", fontFamily: "Helvetica-Bold", fontSize: 8 },
  td: { flexDirection: "row", paddingVertical: 4, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: "#e2e8f0" },
  cDesc: { flex: 3.5 },
  cQty: { flex: 1, textAlign: "right" },
  cPrc: { flex: 1.5, textAlign: "right" },
  cDsc: { flex: 1.3, textAlign: "right" },
  cTot: { flex: 1.5, textAlign: "right" },
  totals: { marginTop: 12, alignSelf: "flex-end", width: 210 },
  totRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  totFinal: { fontFamily: "Helvetica-Bold", fontSize: 11, marginTop: 4, borderTopWidth: 1, borderTopColor: "#0f172a", paddingTop: 4 },
  timbre: { marginTop: 22, alignItems: "center" },
  timbreImg: { width: 240, height: 95, objectFit: "contain" },
  timbreCap: { fontSize: 7.5, color: "#475569", marginTop: 3, textAlign: "center" },
  copia: { fontFamily: "Helvetica-Bold", fontSize: 8, color: "#92400e", marginTop: 4, textAlign: "center" },
});

function fechaCL(iso: string): string {
  const [y, m, d] = iso.split("-");
  return y ? `${d}/${m}/${y}` : iso;
}

function VentaPdf({
  dte,
  copia,
  timbreUri,
}: {
  dte: DteParsed;
  copia?: boolean;
  timbreUri: string | null;
}) {
  const e = dte.emisor;
  const r = dte.receptor;
  const dirEmisor = [e.dir, e.comuna].filter(Boolean).join(", ");
  const dirRecep = [r.dir, r.comuna].filter(Boolean).join(", ");
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View style={s.emisor}>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            {!copia ? <Image style={s.logo} src={LOGO_DATA_URI} /> : null}
            <Text style={s.rzn}>{e.rznSoc}</Text>
            {e.giro ? <Text style={s.line}>{e.giro}</Text> : null}
            {dirEmisor ? <Text style={s.line}>{dirEmisor}</Text> : null}
            {e.ciudad ? <Text style={s.line}>{e.ciudad}</Text> : null}
            {e.correo ? <Text style={s.line}>{e.correo}</Text> : null}
          </View>
          <View style={s.docBox}>
            <Text style={s.docRut}>R.U.T. {e.rut}</Text>
            <Text style={s.docTipo}>{TIPO_DOC[dte.tipoDte] ?? `DOCUMENTO ${dte.tipoDte}`}</Text>
            <Text style={s.docFolio}>N° {dte.folio}</Text>
            <Text style={s.docSii}>S.I.I. {e.ciudad ?? e.comuna ?? ""}</Text>
          </View>
        </View>
        <View style={s.fechaBox}>
          <Text style={s.label}>Fecha Emisión: {fechaCL(dte.fchEmis)}</Text>
        </View>

        <View style={s.recep}>
          <View style={s.recepRow}>
            <Text><Text style={s.bold}>Señor(es): </Text>{r.rznSoc}</Text>
            <Text><Text style={s.bold}>R.U.T.: </Text>{r.rut}</Text>
          </View>
          {r.giro ? <Text style={{ marginTop: 2 }}><Text style={s.bold}>Giro: </Text>{r.giro}</Text> : null}
          {dirRecep ? <Text style={{ marginTop: 2 }}><Text style={s.bold}>Dirección: </Text>{dirRecep}</Text> : null}
          {r.ciudad ? <Text style={{ marginTop: 2 }}><Text style={s.bold}>Ciudad: </Text>{r.ciudad}</Text> : null}
        </View>

        <View style={s.th}>
          <Text style={[s.cDesc, s.thText]}>Detalle</Text>
          <Text style={[s.cQty, s.thText]}>Cant.</Text>
          <Text style={[s.cPrc, s.thText]}>Precio</Text>
          <Text style={[s.cDsc, s.thText]}>Desc.</Text>
          <Text style={[s.cTot, s.thText]}>Monto</Text>
        </View>
        {dte.items.map((it, i) => (
          <View style={s.td} key={i}>
            <Text style={s.cDesc}>{it.nombre}{it.unidad ? ` (${it.unidad})` : ""}</Text>
            <Text style={s.cQty}>{it.cantidad}</Text>
            <Text style={s.cPrc}>{formatCLP(it.precio)}</Text>
            <Text style={s.cDsc}>{it.descuento > 0 ? `-${formatCLP(it.descuento)}` : "—"}</Text>
            <Text style={s.cTot}>{formatCLP(it.monto)}</Text>
          </View>
        ))}

        <View style={s.totals}>
          {dte.exento > 0 ? (
            <View style={s.totRow}><Text>Exento</Text><Text>{formatCLP(dte.exento)}</Text></View>
          ) : null}
          <View style={s.totRow}><Text>Neto</Text><Text>{formatCLP(dte.montoNeto)}</Text></View>
          <View style={s.totRow}><Text>IVA (19%)</Text><Text>{formatCLP(dte.iva)}</Text></View>
          <View style={[s.totRow, s.totFinal]}><Text>Total</Text><Text>{formatCLP(dte.total)}</Text></View>
        </View>

        <View style={s.timbre}>
          {timbreUri ? (
            <>
              {/* eslint-disable-next-line jsx-a11y/alt-text */}
              <Image style={s.timbreImg} src={timbreUri} />
              <Text style={s.timbreCap}>Timbre Electrónico SII — Verifique documento en www.sii.cl</Text>
            </>
          ) : null}
          {copia ? (
            <Text style={s.copia}>COPIA DE FACTURA RECIBIDA — sin valor tributario</Text>
          ) : null}
        </View>
      </Page>
    </Document>
  );
}

export async function generarPdfVenta(dte: DteParsed): Promise<Buffer> {
  const timbreUri = await timbrePng(dte.ted);
  return renderToBuffer(<VentaPdf dte={dte} timbreUri={timbreUri} />);
}

// Mismo layout, rotulado como copia del DTE recibido de un proveedor. El emisor
// del DTE es el proveedor y el receptor es la empresa.
export async function generarPdfFacturaRecibida(dte: DteParsed): Promise<Buffer> {
  const timbreUri = await timbrePng(dte.ted);
  return renderToBuffer(<VentaPdf dte={dte} copia timbreUri={timbreUri} />);
}
