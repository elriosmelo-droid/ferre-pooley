import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import { formatCLP } from "@/lib/money";
import { EMPRESA } from "@/lib/empresa";
import type { DteParsed } from "@/lib/sii/dte-xml";
import { LOGO_DATA_URI } from "./logo-data";

const TIPO_DOC: Record<number, string> = {
  33: "Factura electrónica",
  34: "Factura exenta electrónica",
  56: "Nota de débito electrónica",
  61: "Nota de crédito electrónica",
};

const s = StyleSheet.create({
  page: { padding: 32, fontSize: 9, color: "#0f172a", fontFamily: "Helvetica" },
  row: { flexDirection: "row", justifyContent: "space-between" },
  logo: { width: 130 },
  docBox: { borderWidth: 1, borderColor: "#dc2626", borderRadius: 4, padding: 8, width: 170, alignItems: "center" },
  docTipo: { color: "#dc2626", fontFamily: "Helvetica-Bold", fontSize: 10, textAlign: "center" },
  docFolio: { fontFamily: "Helvetica-Bold", fontSize: 14, marginTop: 4 },
  section: { marginTop: 16 },
  label: { color: "#64748b", fontSize: 8 },
  bold: { fontFamily: "Helvetica-Bold" },
  th: { flexDirection: "row", backgroundColor: "#f1f5f9", paddingVertical: 5, paddingHorizontal: 6, marginTop: 12 },
  td: { flexDirection: "row", paddingVertical: 5, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: "#e2e8f0" },
  cDesc: { flex: 3.5 },
  cQty: { flex: 1, textAlign: "right" },
  cPrc: { flex: 1.5, textAlign: "right" },
  cDsc: { flex: 1.3, textAlign: "right" },
  cTot: { flex: 1.5, textAlign: "right" },
  totals: { marginTop: 12, alignSelf: "flex-end", width: 200 },
  totRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  totFinal: { fontFamily: "Helvetica-Bold", fontSize: 11, marginTop: 4, borderTopWidth: 1, borderTopColor: "#0f172a", paddingTop: 4 },
  copiaBanner: { backgroundColor: "#fef3c7", color: "#92400e", fontFamily: "Helvetica-Bold", fontSize: 10, textAlign: "center", padding: 5, borderRadius: 4, marginBottom: 12 },
});

function VentaPdf({ dte, copia }: { dte: DteParsed; copia?: boolean }) {
  const [y, m, d] = dte.fchEmis.split("-");
  const fecha = y ? `${d}/${m}/${y}` : dte.fchEmis;
  return (
    <Document>
      <Page size="A4" style={s.page}>
        {copia ? (
          <Text style={s.copiaBanner}>COPIA DE FACTURA RECIBIDA</Text>
        ) : null}
        <View style={s.row}>
          <View>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image style={s.logo} src={LOGO_DATA_URI} />
            <Text style={[s.bold, { marginTop: 6 }]}>{dte.emisor.rznSoc}</Text>
            {dte.emisor.giro ? <Text style={s.label}>{dte.emisor.giro}</Text> : null}
            <Text style={s.label}>RUT {dte.emisor.rut}</Text>
            {dte.emisor.dir ? <Text style={s.label}>{dte.emisor.dir}</Text> : null}
          </View>
          <View style={s.docBox}>
            <Text style={s.docTipo}>{TIPO_DOC[dte.tipoDte] ?? `Documento ${dte.tipoDte}`}</Text>
            <Text style={s.docFolio}>N° {dte.folio}</Text>
            <Text style={s.label}>Fecha: {fecha}</Text>
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.label}>Receptor</Text>
          <Text style={s.bold}>{dte.receptor.rznSoc}</Text>
          <Text style={s.label}>RUT {dte.receptor.rut}</Text>
          {dte.receptor.giro ? <Text style={s.label}>{dte.receptor.giro}</Text> : null}
          {dte.receptor.dir ? <Text style={s.label}>{dte.receptor.dir}</Text> : null}
        </View>

        <View style={s.th}>
          <Text style={[s.cDesc, s.bold]}>Detalle</Text>
          <Text style={[s.cQty, s.bold]}>Cant.</Text>
          <Text style={[s.cPrc, s.bold]}>Precio</Text>
          <Text style={[s.cDsc, s.bold]}>Desc.</Text>
          <Text style={[s.cTot, s.bold]}>Monto</Text>
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

        <Text style={[s.label, { marginTop: 24 }]}>
          {copia
            ? `Documento recibido — copia generada desde el SII, sin valor tributario.`
            : `${EMPRESA.nombre} · ${EMPRESA.direccion} · Documento generado desde el SII.`}
        </Text>
      </Page>
    </Document>
  );
}

export function generarPdfVenta(dte: DteParsed): Promise<Buffer> {
  return renderToBuffer(<VentaPdf dte={dte} />);
}

// Misma plantilla, rotulada como copia del DTE recibido de un proveedor. El
// emisor del DTE es el proveedor y el receptor es la empresa.
export function generarPdfFacturaRecibida(dte: DteParsed): Promise<Buffer> {
  return renderToBuffer(<VentaPdf dte={dte} copia />);
}
