// Remitente según el usuario que envía: Victor sale con su casilla; el resto
// con la casilla de ventas.
const REMITENTES: Record<string, string> = {
  "vpooleyf@outlook.com": "Victor Pooley <vpooley@tulbless.cl>",
};
export const REMITENTE_DEFAULT = "Ventas Tulbless <ventas@tulbless.cl>";

export function remitenteDe(emailUsuario: string | null): string {
  return (emailUsuario && REMITENTES[emailUsuario]) || REMITENTE_DEFAULT;
}

export function correoDeRemitente(remitente: string): string {
  return remitente.match(/<([^>]+)>/)?.[1] ?? remitente;
}

// Casillas desde las que sale correo: si un correo recibido iba dirigido a una
// de ellas, no se agrega a CC al responder a todos.
export function casillasPropias(): string[] {
  return [REMITENTE_DEFAULT, ...Object.values(REMITENTES)].map(correoDeRemitente);
}
