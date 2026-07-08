import {
  Body,
  Container,
  Heading,
  Hr,
  Html,
  Section,
  Text,
} from "@react-email/components";

export type FacturaVencida = {
  cliente: string;
  folio: string;
  tipo: string;
  monto: string; // ya formateado
  vencimiento: string; // dd-mm-aaaa
  diasAtraso: number;
};

export type VencimientosEmailProps = {
  facturas: FacturaVencida[];
  totalImpago: string; // ya formateado
};

const celda = {
  padding: "6px 8px",
  fontSize: "13px",
  borderBottom: "1px solid #e2e8f0",
  color: "#334155",
} as const;

export function VencimientosEmail({ facturas, totalImpago }: VencimientosEmailProps) {
  return (
    <Html lang="es">
      <Body
        style={{
          backgroundColor: "#f1f5f9",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          margin: 0,
          padding: "24px 0",
        }}
      >
        <Container
          style={{
            backgroundColor: "#ffffff",
            borderRadius: "8px",
            maxWidth: "640px",
            margin: "0 auto",
            padding: "24px",
          }}
        >
          <Heading style={{ fontSize: "18px", color: "#0f172a", margin: "0 0 4px" }}>
            Facturas vencidas e impagas
          </Heading>
          <Text style={{ fontSize: "13px", color: "#64748b", margin: "0 0 16px" }}>
            Estas facturas pasaron su fecha de vencimiento y siguen sin pago.
          </Text>

          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...celda, textAlign: "left", color: "#64748b" }}>Cliente</th>
                <th style={{ ...celda, textAlign: "left", color: "#64748b" }}>Doc</th>
                <th style={{ ...celda, textAlign: "right", color: "#64748b" }}>Monto</th>
                <th style={{ ...celda, textAlign: "right", color: "#64748b" }}>Vence</th>
                <th style={{ ...celda, textAlign: "right", color: "#64748b" }}>Atraso</th>
              </tr>
            </thead>
            <tbody>
              {facturas.map((f, i) => (
                <tr key={i}>
                  <td style={{ ...celda, textAlign: "left" }}>{f.cliente}</td>
                  <td style={{ ...celda, textAlign: "left" }}>
                    {f.tipo} {f.folio}
                  </td>
                  <td style={{ ...celda, textAlign: "right" }}>{f.monto}</td>
                  <td style={{ ...celda, textAlign: "right" }}>{f.vencimiento}</td>
                  <td style={{ ...celda, textAlign: "right", color: "#dc2626" }}>
                    {f.diasAtraso} d
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <Hr style={{ borderColor: "#e2e8f0", margin: "16px 0" }} />
          <Section style={{ textAlign: "right" }}>
            <Text style={{ fontSize: "15px", fontWeight: "bold", color: "#0f172a", margin: 0 }}>
              Total impago vencido: {totalImpago}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
