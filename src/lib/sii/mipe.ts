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

class Sesion {
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
  const xml = r.buf.toString("latin1");
  if (!xml.includes("</DTE>")) return null;

  // El día puede traer varios DTE; quedarse con el del folio+tipo pedido.
  for (const part of xml.split("</DTE>")) {
    const folio = part.match(/<Folio>(\d+)/)?.[1];
    const tipo = part.match(/<TipoDTE>(\d+)/)?.[1];
    if (folio === args.folio && tipo === String(args.tipoDoc)) {
      const start = part.indexOf("<DTE");
      return (start >= 0 ? part.slice(start) : part) + "</DTE>";
    }
  }
  return null;
}
