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
  // Reenvío de una orden que se editó después de haberla enviado: el proveedor
  // ya tiene una versión anterior en su correo y hay que avisarle.
  corregida?: boolean;
};

export function OrdenCompraEmail({
  folio,
  proveedorNombre,
  total,
  empresa,
  corregida = false,
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
            {corregida ? " (corregida)" : ""}
          </Heading>
          <Text style={{ color: "#334155", fontSize: "14px", lineHeight: "22px" }}>
            Estimados {proveedorNombre}:
          </Text>
          {corregida && (
            <Text
              style={{
                backgroundColor: "#fef3c7",
                borderRadius: "6px",
                color: "#92400e",
                fontSize: "14px",
                lineHeight: "22px",
                padding: "12px 14px",
              }}
            >
              <strong>Esta orden fue corregida.</strong> Reemplaza la versión
              que les enviamos antes: por favor consideren solo el PDF adjunto.
            </Text>
          )}
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
