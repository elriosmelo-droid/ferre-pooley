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

export type CotizacionEmailProps = {
  folio: string;
  clienteNombre: string;
  total: string;
  validaHasta: string;
  linkAceptar: string;
  empresa: string;
};

export function CotizacionEmail({
  folio,
  clienteNombre,
  total,
  validaHasta,
  linkAceptar,
  empresa,
}: CotizacionEmailProps) {
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
            style={{ color: "#0f172a", fontSize: "20px", margin: "0 0 16px" }}
          >
            Cotización {folio}
          </Heading>
          <Text style={{ color: "#334155", fontSize: "14px", lineHeight: "22px" }}>
            Estimado/a {clienteNombre}:
          </Text>
          <Text style={{ color: "#334155", fontSize: "14px", lineHeight: "22px" }}>
            Le enviamos la cotización {folio} por un total de{" "}
            <strong>{total}</strong> (IVA incluido). Adjuntamos el detalle en
            PDF.
          </Text>
          <Section style={{ textAlign: "center", margin: "28px 0" }}>
            <Button
              href={linkAceptar}
              style={{
                backgroundColor: "#2563eb",
                borderRadius: "6px",
                color: "#ffffff",
                fontSize: "15px",
                fontWeight: "600",
                padding: "12px 28px",
                textDecoration: "none",
              }}
            >
              Aceptar cotización
            </Button>
          </Section>
          <Text style={{ color: "#64748b", fontSize: "12px", lineHeight: "18px" }}>
            Desde el mismo enlace también puede rechazarla. Válida hasta{" "}
            {validaHasta}.
          </Text>
          <Hr style={{ borderColor: "#e2e8f0", margin: "24px 0 16px" }} />
          <Text style={{ color: "#94a3b8", fontSize: "12px", margin: 0 }}>
            {empresa} · Enviado con Ferre Pooley
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
