import {
  Body,
  Button,
  Container,
  Heading,
  Hr,
  Html,
  Section,
  Text,
} from "@react-email/components";

export type AvisoRespuestaEmailProps = {
  folio: string;
  clienteNombre: string;
  aceptada: boolean;
  notaVentaFolio: string | null;
  linkNotasVenta: string | null;
};

export function AvisoRespuestaEmail({
  folio,
  clienteNombre,
  aceptada,
  notaVentaFolio,
  linkNotasVenta,
}: AvisoRespuestaEmailProps) {
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
            margin: "0 auto",
            maxWidth: "520px",
            padding: "32px",
          }}
        >
          <Heading
            as="h2"
            style={{
              color: aceptada ? "#15803d" : "#0f172a",
              fontSize: "20px",
              margin: "0 0 16px",
            }}
          >
            Cotización {folio} {aceptada ? "aceptada" : "rechazada"}
          </Heading>
          <Text style={{ color: "#334155", fontSize: "14px", lineHeight: "22px" }}>
            El cliente <strong>{clienteNombre}</strong>{" "}
            {aceptada ? "aceptó" : "rechazó"} la cotización{" "}
            <strong>{folio}</strong>.
          </Text>
          {aceptada && notaVentaFolio && (
            <Text
              style={{ color: "#334155", fontSize: "14px", lineHeight: "22px" }}
            >
              Se creó automáticamente la nota de venta{" "}
              <strong>{notaVentaFolio}</strong>.
            </Text>
          )}
          {aceptada && linkNotasVenta && (
            <Section style={{ textAlign: "center", margin: "28px 0" }}>
              <Button
                href={linkNotasVenta}
                style={{
                  backgroundColor: "#16a34a",
                  borderRadius: "6px",
                  color: "#ffffff",
                  fontSize: "15px",
                  fontWeight: "600",
                  padding: "12px 28px",
                  textDecoration: "none",
                }}
              >
                Ver notas de venta
              </Button>
            </Section>
          )}
          <Hr style={{ borderColor: "#e2e8f0", margin: "24px 0 16px" }} />
          <Text style={{ color: "#94a3b8", fontSize: "12px", margin: 0 }}>
            Aviso automático de Ferre Pooley
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
