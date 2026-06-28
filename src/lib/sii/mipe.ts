import "server-only";
import https from "node:https";
import { URL } from "node:url";

// Descarga DTE emitidos (ORIGEN=ENV) del portal MIPE gratuito del SII.
// Auth con certificado digital (TLS client cert). El reCAPTCHA del portal es
// solo frontend; el endpoint XML no lo valida.

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const PORTAL = "https://www1.sii.cl/cgi-bin/Portal001";
const AUTH = "https://herculesr.sii.cl/cgi_AUT2000/CAutInicio.cgi";

function pemFromEnv(name: string): string {
  const b64 = process.env[name];
  if (!b64) throw new Error(`Falta la variable de entorno ${name}`);
  const v = b64.trim();
  return v.includes("-----BEGIN")
    ? v.replace(/\\n/g, "\n")
    : Buffer.from(v, "base64").toString("utf8");
}

type Resp = { status: number; buf: Buffer };

export class Sesion {
  private jar: Record<string, string> = {};
  private agent: https.Agent;
  constructor() {
    this.agent = new https.Agent({
      cert: pemFromEnv("SII_CERT_PEM_B64"),
      key: pemFromEnv("SII_KEY_PEM_B64"),
      rejectUnauthorized: false,
      keepAlive: true,
      minVersion: "TLSv1",
      ciphers: "DEFAULT@SECLEVEL=0",
    });
  }
  private cookie() {
    return Object.entries(this.jar).map(([k, v]) => `${k}=${v}`).join("; ");
  }
  private setCookies(h: import("node:http").IncomingHttpHeaders) {
    for (const c of h["set-cookie"] ?? []) {
      const [pair] = c.split(";");
      const i = pair.indexOf("=");
      if (i > 0) this.jar[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
    }
  }
  req(method: "GET" | "POST", urlStr: string, body?: string): Promise<Resp> {
    return new Promise((resolve, reject) => {
      const u = new URL(urlStr);
      const r = https.request(
        {
          method,
          hostname: u.hostname,
          path: u.pathname + u.search,
          agent: this.agent,
          headers: {
            "User-Agent": UA,
            Cookie: this.cookie(),
            ...(body
              ? {
                  "Content-Type": "application/x-www-form-urlencoded",
                  "Content-Length": Buffer.byteLength(body),
                }
              : {}),
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (d) => chunks.push(d));
          res.on("end", () => {
            this.setCookies(res.headers);
            resolve({ status: res.statusCode ?? 0, buf: Buffer.concat(chunks) });
          });
        }
      );
      r.on("error", reject);
      if (body) r.write(body);
      r.end();
    });
  }
}

export async function descargarDteEmitidoXml(args: {
  fecha: string;
  folio: string;
  tipoDoc: number;
}): Promise<string | null> {
  const titular = process.env.SII_RUT_TITULAR;
  const empresa = process.env.SII_RUT_EMPRESA;
  if (!titular || !empresa) throw new Error("Falta SII_RUT_TITULAR o SII_RUT_EMPRESA");
  const [rutNum, dv] = titular.split("-");

  const s = new Sesion();
  const ref = `${PORTAL}/mipeAdminDocsEmi.cgi`;
  const auth = await s.req(
    "GET",
    `${AUTH}?rutcntr=${titular}&rut=${rutNum}&dv=${dv}&referencia=${encodeURIComponent(ref)}`
  );
  if (auth.status !== 200 || auth.buf.toString("latin1").includes("01.01.215.500.440.33")) {
    throw new Error("Autenticación SII falló (certificado rechazado)");
  }

  await s.req("GET", `${PORTAL}/mipeSelEmpresa.cgi?DESDE_DONDE_URL=OPCION=1`);
  await s.req(
    "POST",
    `${PORTAL}/mipeSelEmpresa.cgi`,
    `DESDE_DONDE_URL=OPCION%3D1&RUT_EMP=${encodeURIComponent(empresa)}`
  );
  await s.req("GET", `${PORTAL}/mipeLaunchPage.cgi?OPCION=1&TIPO=4`);

  const r = await s.req(
    "GET",
    `${PORTAL}/mipeDownLoad.cgi?ORIGEN=ENV&RUT_RECP=&FOLIO=&RZN_SOC=&FEC_DESDE=${args.fecha}&FEC_HASTA=${args.fecha}&TPO_DOC=&ESTADO=&ORDEN=&DOWNLOAD=XML`
  );
  if (r.status === 429) throw new Error("SII rate limit (429)");
  return filtrarDtePorFolio(r.buf.toString("latin1"), args.folio, args.tipoDoc);
}

// De un XML compilado (SetDTE con 0..N DTE) devuelve el bloque <DTE>...</DTE>
// cuyo folio + tipo calzan, o null si no aparece.
function filtrarDtePorFolio(
  xml: string,
  folio: string,
  tipoDoc: number
): string | null {
  if (!xml.includes("</DTE>")) return null;
  for (const part of xml.split("</DTE>")) {
    const f = part.match(/<Folio>(\d+)/)?.[1];
    const t = part.match(/<TipoDTE>(\d+)/)?.[1];
    if (f === folio && t === String(tipoDoc)) {
      const start = part.indexOf("<DTE");
      return (start >= 0 ? part.slice(start) : part) + "</DTE>";
    }
  }
  return null;
}

// Descarga el DTE RECIBIDO (compra) del SII y devuelve su XML, o null si no
// aparece. A diferencia de los emitidos, los recibidos (ORIGEN=RCP) requieren
// un POST de inicialización a mipeAdminDocsRcp.cgi que arma el token del módulo
// antes de poder descargar. Flujo validado en el script de producción
// `proceso_semanal/descargar_facturas_pfx.py`. Es cert puro, sin clave.
// Abre una sesión MIPE en el módulo de documentos RECIBIDOS (auth cert +
// selección de empresa + launch). Reutilizable para bajar varios días con una
// sola autenticación (el SII rate-limitea por IP, así que conviene minimizar
// sesiones). Lanza si el certificado es rechazado.
export async function abrirSesionRecibidos(): Promise<Sesion> {
  const titular = process.env.SII_RUT_TITULAR;
  const empresa = process.env.SII_RUT_EMPRESA;
  if (!titular || !empresa) throw new Error("Falta SII_RUT_TITULAR o SII_RUT_EMPRESA");
  const [rutNum, dv] = titular.split("-");

  const s = new Sesion();
  const ref = `${PORTAL}/mipeAdminDocsRcp.cgi`;
  const auth = await s.req(
    "GET",
    `${AUTH}?rutcntr=${titular}&rut=${rutNum}&referencia=${encodeURIComponent(ref)}&dv=${dv}`
  );
  if (auth.status !== 200 || auth.buf.toString("latin1").includes("01.01.215.500.440.33")) {
    throw new Error("Autenticación SII falló (certificado rechazado)");
  }

  // El DESDE_DONDE_URL va url-encoded como un solo valor.
  await s.req("GET", `${PORTAL}/mipeSelEmpresa.cgi?DESDE_DONDE_URL=OPCION=1&TIPO=4`);
  await s.req(
    "POST",
    `${PORTAL}/mipeSelEmpresa.cgi`,
    `DESDE_DONDE_URL=OPCION%3D1%26TIPO%3D4&RUT_EMP=${encodeURIComponent(empresa)}`
  );
  await s.req("GET", `${PORTAL}/mipeLaunchPage.cgi?OPCION=1&TIPO=4`);
  return s;
}

// Baja el XML compilado (SetDTE, 0..N DTE) de los documentos recibidos en un
// RANGO de fechas, sobre una sesión ya abierta. Un solo rango (p.ej. todo un
// mes) trae todos los documentos del período en una request → evita abrir
// decenas de requests día por día (que el SII throttlea). El POST de init arma
// el token del módulo (sin él mipeDownLoad responde "Error 501 ptr NULL").
export async function descargarReciRangoXml(
  s: Sesion,
  desde: string,
  hasta: string
): Promise<string> {
  await s.req(
    "POST",
    `${PORTAL}/mipeAdminDocsRcp.cgi`,
    `RUT_EMI=&ORIGEN=RCP&TPO_DOC=&FEC_DESDE=${desde}&FEC_HASTA=${hasta}` +
      `&FOLIO=&FOLIOHASTA=&RUT_RECP=&RZN_SOC=&ESTADO=&ORDEN=&NUM_PAG=1&TPO_ARCHIVO=dte`
  );
  const r = await s.req(
    "GET",
    `${PORTAL}/mipeDownLoad.cgi?ORIGEN=RCP&RUT_EMI=&FOLIO=&FOLIOHASTA=&RZN_SOC=&FEC_DESDE=${desde}&FEC_HASTA=${hasta}&TPO_DOC=&ESTADO=&ORDEN=&DOWNLOAD=XML`
  );
  if (r.status === 429) throw new Error("SII rate limit (429)");
  return r.buf.toString("latin1");
}

// Devuelve los bloques <DTE>...</DTE> de un XML compilado, con su folio y tipo.
export function separarDtes(xml: string): { folio: string; tipoDoc: number; xml: string }[] {
  if (!xml.includes("</DTE>")) return [];
  const out: { folio: string; tipoDoc: number; xml: string }[] = [];
  for (const part of xml.split("</DTE>")) {
    const folio = part.match(/<Folio>(\d+)/)?.[1];
    const tipo = part.match(/<TipoDTE>(\d+)/)?.[1];
    if (!folio || !tipo) continue;
    const start = part.indexOf("<DTE");
    out.push({ folio, tipoDoc: Number(tipo), xml: (start >= 0 ? part.slice(start) : part) + "</DTE>" });
  }
  return out;
}

// Baja el DTE recibido de un folio puntual (abre su propia sesión). Para varios
// usar abrirSesionRecibidos + descargarReciDiaXml.
export async function descargarDteRecibidoXml(args: {
  fecha: string;
  folio: string;
  tipoDoc: number;
}): Promise<string | null> {
  const s = await abrirSesionRecibidos();
  const xml = await descargarReciRangoXml(s, args.fecha, args.fecha);
  return filtrarDtePorFolio(xml, args.folio, args.tipoDoc);
}
