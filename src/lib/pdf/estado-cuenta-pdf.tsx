import {
  Document,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import { formatCLP } from "@/lib/money";
import { EMPRESA } from "@/lib/empresa";
import type { EstadoCuenta, EstadoPago } from "@/lib/estado-cuenta";
import { LOGO_DATA_URI } from "./logo-data";

export type DatosPdfEstadoCuenta = {
  cliente: { nombre: string; rut: string | null };
  estado: EstadoCuenta;
  fecha: string; // ISO, fecha de generación
};

Font.registerHyphenationCallback((word) => [word]);

function clp(n: number) {
  return formatCLP(n).replace(/[  ]/g, " ");
}

function fmtFecha(iso: string | null) {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}-${m}-${a}`;
}

const ETIQUETA_PAGO: Record<EstadoPago, string> = {
  pendiente: "Pendiente",
  pagada: "Pagada",
  anulada: "Anulada",
};

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#1e293b",
    paddingTop: 40,
    paddingHorizontal: 40,
    paddingBottom: 56,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  logo: { width: 130, marginBottom: 6 },
  tagline: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    color: "#000000",
    marginBottom: 6,
    maxWidth: 260,
  },
  empresaLinea: { marginBottom: 2, color: "#475569" },
  docTitulo: {
    fontFamily: "Helvetica-Bold",
    fontSize: 16,
    textAlign: "right",
    marginBottom: 4,
  },
  docLinea: { textAlign: "right", marginBottom: 2, color: "#475569" },
  clienteBox: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 4,
    padding: 10,
    marginBottom: 20,
  },
  clienteTitulo: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    color: "#64748b",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  clienteLinea: { marginBottom: 2, color: "#475569" },
  clienteLabel: { fontFamily: "Helvetica-Bold", color: "#1e293b" },
  tablaHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#94a3b8",
    paddingBottom: 4,
    marginBottom: 2,
  },
  tablaFila: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    paddingVertical: 4,
  },
  th: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    color: "#64748b",
    textTransform: "uppercase",
  },
  colFecha: { width: "14%" },
  colTipo: { width: "13%" },
  colFolio: { width: "14%" },
  colMonto: { width: "19%", textAlign: "right" },
  colPlazo: { width: "13%" },
  colVenc: { width: "15%" },
  colEstado: { width: "12%", textAlign: "right" },
  credito: { color: "#dc2626" },
  vencida: { color: "#dc2626", fontFamily: "Helvetica-Bold" },
  totales: { marginTop: 14, alignSelf: "flex-end", width: 240 },
  totalFila: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 3,
  },
  totalLabel: { color: "#475569" },
  totalFinal: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#94a3b8",
    paddingTop: 4,
    marginTop: 2,
  },
  totalFinalTexto: { fontFamily: "Helvetica-Bold", fontSize: 12 },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    textAlign: "center",
    fontSize: 8,
    color: "#94a3b8",
  },
});

function EstadoCuentaPdf({ cliente, estado, fecha }: DatosPdfEstadoCuenta) {
  const { filas, totales } = estado;
  const saldoAFavor = totales.saldo < 0;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image style={styles.logo} src={LOGO_DATA_URI} />
            <Text style={styles.tagline}>{EMPRESA.tagline}</Text>
            <Text style={styles.empresaLinea}>RUT: {EMPRESA.rut}</Text>
            <Text style={styles.empresaLinea}>{EMPRESA.direccion}</Text>
          </View>
          <View>
            <Text style={styles.docTitulo}>ESTADO DE CUENTA</Text>
            <Text style={styles.docLinea}>Emitido: {fmtFecha(fecha)}</Text>
          </View>
        </View>

        <View style={styles.clienteBox}>
          <Text style={styles.clienteTitulo}>Cliente</Text>
          <Text style={styles.clienteLinea}>
            <Text style={styles.clienteLabel}>Nombre: </Text>
            {cliente.nombre}
          </Text>
          <Text style={styles.clienteLinea}>
            <Text style={styles.clienteLabel}>RUT: </Text>
            {cliente.rut ?? "—"}
          </Text>
        </View>

        <View style={styles.tablaHeader}>
          <Text style={[styles.th, styles.colFecha]}>Fecha</Text>
          <Text style={[styles.th, styles.colTipo]}>Tipo</Text>
          <Text style={[styles.th, styles.colFolio]}>Folio</Text>
          <Text style={[styles.th, styles.colMonto]}>Monto</Text>
          <Text style={[styles.th, styles.colPlazo]}>Plazo</Text>
          <Text style={[styles.th, styles.colVenc]}>Vence</Text>
          <Text style={[styles.th, styles.colEstado]}>Estado</Text>
        </View>
        {filas.length === 0 ? (
          <View style={styles.tablaFila}>
            <Text>Sin documentos del SII.</Text>
          </View>
        ) : (
          filas.map((f) => (
            <View key={f.id} style={styles.tablaFila} wrap={false}>
              <Text style={styles.colFecha}>{fmtFecha(f.fecha)}</Text>
              <Text style={styles.colTipo}>{f.tipoLabel}</Text>
              <Text style={styles.colFolio}>{f.folio}</Text>
              <Text
                style={[styles.colMonto, ...(f.esCredito ? [styles.credito] : [])]}
              >
                {f.esCredito ? "− " : ""}
                {clp(f.monto)}
              </Text>
              <Text style={styles.colPlazo}>{f.plazoLabel}</Text>
              <Text style={[styles.colVenc, ...(f.vencida ? [styles.vencida] : [])]}>
                {f.vencimiento ? fmtFecha(f.vencimiento) : "—"}
              </Text>
              <Text style={styles.colEstado}>
                {f.estadoPago ? ETIQUETA_PAGO[f.estadoPago] : "Crédito"}
              </Text>
            </View>
          ))
        )}

        <View style={styles.totales}>
          <View style={styles.totalFila}>
            <Text style={styles.totalLabel}>Facturado</Text>
            <Text>{clp(totales.facturado)}</Text>
          </View>
          <View style={styles.totalFila}>
            <Text style={styles.totalLabel}>Notas de crédito</Text>
            <Text>− {clp(totales.creditos)}</Text>
          </View>
          <View style={styles.totalFila}>
            <Text style={styles.totalLabel}>Pagado</Text>
            <Text>− {clp(totales.pagado)}</Text>
          </View>
          <View style={styles.totalFinal}>
            <Text style={styles.totalFinalTexto}>
              {saldoAFavor ? "SALDO A FAVOR" : "SALDO PENDIENTE"}
            </Text>
            <Text style={styles.totalFinalTexto}>
              {clp(Math.abs(totales.saldo))}
            </Text>
          </View>
        </View>

        <Text style={styles.footer} fixed>
          Documento generado por Tulbless
        </Text>
      </Page>
    </Document>
  );
}

export async function generarPdfEstadoCuenta(
  data: DatosPdfEstadoCuenta
): Promise<Buffer> {
  return renderToBuffer(<EstadoCuentaPdf {...data} />);
}
