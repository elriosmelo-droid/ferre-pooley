import {
  Body,
  Container,
  Heading,
  Hr,
  Html,
  Text,
} from "@react-email/components";

export type OrdenCompraEmailProps = {
  folio: string;
  proveedorNombre: string;
  total: string;
  empresa: string;
};

export function OrdenCompraEmail({
  folio,
  proveedorNombre,
  total,
  empresa,
}: OrdenCompraEmailProps) {
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
            Orden de compra {folio}
          </Heading>
          <Text style={{ color: "#334155", fontSize: "14px", lineHeight: "22px" }}>
            Estimados {proveedorNombre}:
          </Text>
          <Text style={{ color: "#334155", fontSize: "14px", lineHeight: "22px" }}>
            Adjuntamos la orden de compra {folio} por un total de{" "}
            <strong>{total}</strong> (IVA incluido). El detalle va en el PDF
            adjunto.
          </Text>
          <Hr style={{ borderColor: "#e2e8f0", margin: "24px 0 16px" }} />
          <Text style={{ color: "#94a3b8", fontSize: "12px", margin: 0 }}>
            {empresa} · Enviado con Tulbless
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
