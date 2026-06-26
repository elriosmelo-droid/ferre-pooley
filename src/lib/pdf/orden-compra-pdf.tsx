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
import { LOGO_DATA_URI } from "./logo-data";

export type DatosPdfOrdenCompra = {
  orden: {
    folio: string;
    created_at: string;
    comprador: string | null;
    subtotal_neto: number;
    iva: number;
    total: number;
    notas: string | null;
  };
  items: {
    sku: string;
    descripcion: string;
    cantidad: number;
    precio: number;
  }[];
  proveedor: {
    razon_social: string | null;
    rut: string;
    correo: string | null;
  };
};

// Evita que @react-pdf parta palabras con guion (ej. "Construc-ción").
Font.registerHyphenationCallback((word) => [word]);

// Helvetica estándar no soporta algunos espacios Unicode que emite Intl.
function clp(n: number) {
  return formatCLP(n).replace(/[  ]/g, " ");
}

function formatFecha(value: string) {
  const [anio, mes, dia] = value.slice(0, 10).split("-");
  return `${dia}-${mes}-${anio}`;
}

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
  compradorLinea: {
    marginTop: 4,
    fontFamily: "Helvetica-Bold",
    color: "#1e293b",
  },
  docTitulo: {
    fontFamily: "Helvetica-Bold",
    fontSize: 16,
    textAlign: "right",
    marginBottom: 4,
  },
  docLinea: { textAlign: "right", marginBottom: 2, color: "#475569" },
  docFolio: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    textAlign: "right",
    marginBottom: 4,
  },
  proveedorBox: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 4,
    padding: 10,
    marginBottom: 20,
  },
  proveedorTitulo: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    color: "#64748b",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  proveedorLinea: { marginBottom: 2, color: "#475569" },
  proveedorLabel: { fontFamily: "Helvetica-Bold", color: "#1e293b" },
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
  colSku: { width: "16%" },
  colDescripcion: { width: "44%", paddingRight: 6 },
  colCantidad: { width: "12%", textAlign: "right" },
  colPrecio: { width: "14%", textAlign: "right" },
  colTotal: { width: "14%", textAlign: "right" },
  totales: { marginTop: 12, alignSelf: "flex-end", width: 200 },
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
  totalFinalTexto: { fontFamily: "Helvetica-Bold", fontSize: 11 },
  notas: { marginTop: 20 },
  notasTitulo: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    color: "#64748b",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  notasTexto: { color: "#475569" },
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

function OrdenCompraPdf({ orden, items, proveedor }: DatosPdfOrdenCompra) {
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
            {orden.comprador ? (
              <Text style={styles.compradorLinea}>
                Comprador: {orden.comprador}
              </Text>
            ) : null}
          </View>
          <View>
            <Text style={styles.docTitulo}>ORDEN DE COMPRA</Text>
            <Text style={styles.docFolio}>{orden.folio}</Text>
            <Text style={styles.docLinea}>
              Fecha de emisión: {formatFecha(orden.created_at)}
            </Text>
          </View>
        </View>

        <View style={styles.proveedorBox}>
          <Text style={styles.proveedorTitulo}>Proveedor</Text>
          <Text style={styles.proveedorLinea}>
            <Text style={styles.proveedorLabel}>Razón social: </Text>
            {proveedor.razon_social ?? proveedor.rut}
          </Text>
          <Text style={styles.proveedorLinea}>
            <Text style={styles.proveedorLabel}>RUT: </Text>
            {proveedor.rut}
          </Text>
          {proveedor.correo ? (
            <Text style={styles.proveedorLinea}>
              <Text style={styles.proveedorLabel}>Correo: </Text>
              {proveedor.correo}
            </Text>
          ) : null}
        </View>

        <View style={styles.tablaHeader}>
          <Text style={[styles.th, styles.colSku]}>SKU</Text>
          <Text style={[styles.th, styles.colDescripcion]}>Descripción</Text>
          <Text style={[styles.th, styles.colCantidad]}>Cant.</Text>
          <Text style={[styles.th, styles.colPrecio]}>P. unit.</Text>
          <Text style={[styles.th, styles.colTotal]}>Total</Text>
        </View>
        {items.map((item, index) => (
          <View key={index} style={styles.tablaFila} wrap={false}>
            <Text style={styles.colSku}>{item.sku || "—"}</Text>
            <Text style={styles.colDescripcion}>{item.descripcion}</Text>
            <Text style={styles.colCantidad}>{item.cantidad}</Text>
            <Text style={styles.colPrecio}>{clp(item.precio)}</Text>
            <Text style={styles.colTotal}>
              {clp(item.cantidad * item.precio)}
            </Text>
          </View>
        ))}

        <View style={styles.totales}>
          <View style={styles.totalFila}>
            <Text style={styles.totalLabel}>Subtotal neto</Text>
            <Text>{clp(orden.subtotal_neto)}</Text>
          </View>
          <View style={styles.totalFila}>
            <Text style={styles.totalLabel}>IVA (19%)</Text>
            <Text>{clp(orden.iva)}</Text>
          </View>
          <View style={styles.totalFinal}>
            <Text style={styles.totalFinalTexto}>TOTAL</Text>
            <Text style={styles.totalFinalTexto}>{clp(orden.total)}</Text>
          </View>
        </View>

        {orden.notas ? (
          <View style={styles.notas}>
            <Text style={styles.notasTitulo}>Notas</Text>
            <Text style={styles.notasTexto}>{orden.notas}</Text>
          </View>
        ) : null}

        <Text style={styles.footer} fixed>
          Documento generado por Tulbless
        </Text>
      </Page>
    </Document>
  );
}

export async function generarPdfOrdenCompra(
  data: DatosPdfOrdenCompra
): Promise<Buffer> {
  return renderToBuffer(<OrdenCompraPdf {...data} />);
}
