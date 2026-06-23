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
import { etiquetasMedioPago } from "@/lib/medio-pago";
import { EMPRESA } from "@/lib/empresa";
import { LOGO_DATA_URI } from "./logo-data";

// Datos mínimos para el PDF. NUNCA incluir costo ni margen: son internos.
export type DatosPdfCotizacion = {
  cotizacion: {
    folio: string;
    created_at: string;
    fecha_validez: string;
    medio_pago: string[];
    vendedor: string | null;
    subtotal_bruto: number;
    descuento: number;
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
    descuento: number;
    precioConDesc: number;
  }[];
  cliente: {
    nombre: string;
    rut: string | null;
    correo: string;
    telefono: string | null;
    direccion: string | null;
  };
};

// Helvetica estándar no soporta algunos espacios Unicode que emite Intl.
function clp(n: number) {
  return formatCLP(n).replace(/[  ]/g, " ");
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
    maxWidth: 200,
  },
  empresaLinea: { marginBottom: 2, color: "#475569" },
  vendedorLinea: {
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
  colSku: { width: "12%" },
  colDescripcion: { width: "30%", paddingRight: 6 },
  colCantidad: { width: "8%", textAlign: "right" },
  colPrecio: { width: "16%", textAlign: "right" },
  colDescuento: { width: "10%", textAlign: "right" },
  colPrecioDesc: { width: "12%", textAlign: "right" },
  colTotal: { width: "12%", textAlign: "right" },
  totales: {
    marginTop: 12,
    alignSelf: "flex-end",
    width: 200,
  },
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
  medioPagoBox: { flexDirection: "row", marginTop: 16 },
  medioPagoLabel: { fontFamily: "Helvetica-Bold" },
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

function CotizacionPdf({ cotizacion, items, cliente }: DatosPdfCotizacion) {
  const hayDescuento = items.some((it) => it.descuento > 0);

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
            {cotizacion.vendedor ? (
              <Text style={styles.vendedorLinea}>
                Vendedor: {cotizacion.vendedor}
              </Text>
            ) : null}
          </View>
          <View>
            <Text style={styles.docTitulo}>COTIZACIÓN</Text>
            <Text style={styles.docFolio}>{cotizacion.folio}</Text>
            <Text style={styles.docLinea}>
              Fecha de emisión: {formatFecha(cotizacion.created_at)}
            </Text>
            <Text style={styles.docLinea}>
              Válida hasta: {formatFecha(cotizacion.fecha_validez)}
            </Text>
          </View>
        </View>

        <View style={styles.clienteBox}>
          <Text style={styles.clienteTitulo}>Cliente</Text>
          {cliente.nombre ? (
            <Text style={styles.clienteLinea}>
              <Text style={styles.clienteLabel}>Nombre: </Text>
              {cliente.nombre}
            </Text>
          ) : null}
          {cliente.rut ? (
            <Text style={styles.clienteLinea}>
              <Text style={styles.clienteLabel}>RUT: </Text>
              {cliente.rut}
            </Text>
          ) : null}
          {cliente.correo ? (
            <Text style={styles.clienteLinea}>
              <Text style={styles.clienteLabel}>Correo: </Text>
              {cliente.correo}
            </Text>
          ) : null}
          {cliente.telefono ? (
            <Text style={styles.clienteLinea}>
              <Text style={styles.clienteLabel}>Teléfono: </Text>
              {cliente.telefono}
            </Text>
          ) : null}
          {cliente.direccion ? (
            <Text style={styles.clienteLinea}>
              <Text style={styles.clienteLabel}>Dirección: </Text>
              {cliente.direccion}
            </Text>
          ) : null}
        </View>

        <View style={styles.tablaHeader}>
          <Text style={[styles.th, styles.colSku]}>SKU</Text>
          <Text style={[styles.th, styles.colDescripcion]}>Descripción</Text>
          <Text style={[styles.th, styles.colCantidad]}>Cant.</Text>
          <Text style={[styles.th, styles.colPrecio]}>P. unit.</Text>
          <Text style={[styles.th, styles.colDescuento]}>Desc.</Text>
          <Text style={[styles.th, styles.colPrecioDesc]}>P. c/desc</Text>
          <Text style={[styles.th, styles.colTotal]}>Total</Text>
        </View>
        {items.map((item, index) => (
          <View key={index} style={styles.tablaFila} wrap={false}>
            <Text style={styles.colSku}>{item.sku || "—"}</Text>
            <Text style={styles.colDescripcion}>{item.descripcion}</Text>
            <Text style={styles.colCantidad}>{item.cantidad}</Text>
            <Text style={styles.colPrecio}>{clp(item.precio)}</Text>
            <Text style={styles.colDescuento}>
              {item.descuento > 0 ? `${item.descuento}%` : "—"}
            </Text>
            <Text style={styles.colPrecioDesc}>{clp(item.precioConDesc)}</Text>
            <Text style={styles.colTotal}>
              {clp(item.cantidad * item.precioConDesc)}
            </Text>
          </View>
        ))}

        <View style={styles.totales}>
          {hayDescuento ? (
            <>
              <View style={styles.totalFila}>
                <Text style={styles.totalLabel}>Subtotal bruto</Text>
                <Text>{clp(cotizacion.subtotal_bruto)}</Text>
              </View>
              <View style={styles.totalFila}>
                <Text style={styles.totalLabel}>Descuento</Text>
                <Text>-{clp(cotizacion.descuento)}</Text>
              </View>
            </>
          ) : null}
          <View style={styles.totalFila}>
            <Text style={styles.totalLabel}>Subtotal neto</Text>
            <Text>{clp(cotizacion.subtotal_neto)}</Text>
          </View>
          <View style={styles.totalFila}>
            <Text style={styles.totalLabel}>IVA (19%)</Text>
            <Text>{clp(cotizacion.iva)}</Text>
          </View>
          <View style={styles.totalFinal}>
            <Text style={styles.totalFinalTexto}>TOTAL</Text>
            <Text style={styles.totalFinalTexto}>{clp(cotizacion.total)}</Text>
          </View>
        </View>

        <View style={styles.medioPagoBox}>
          <Text style={styles.medioPagoLabel}>Medios de pago: </Text>
          <Text>{etiquetasMedioPago(cotizacion.medio_pago)}</Text>
        </View>

        {cotizacion.notas ? (
          <View style={styles.notas}>
            <Text style={styles.notasTitulo}>Notas</Text>
            <Text style={styles.notasTexto}>{cotizacion.notas}</Text>
          </View>
        ) : null}

        <Text style={styles.footer} fixed>
          Documento generado por Tulbless
        </Text>
      </Page>
    </Document>
  );
}

export async function generarPdfCotizacion(
  data: DatosPdfCotizacion
): Promise<Buffer> {
  return renderToBuffer(<CotizacionPdf {...data} />);
}
