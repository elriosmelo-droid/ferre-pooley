import "server-only";
import https from "node:https";
import type { IncomingHttpHeaders } from "node:http";
import { randomUUID } from "node:crypto";

// Cliente del Registro de Compra y Venta (RCV) del SII para bajar las facturas
// de compra (DTE recibidos) de la empresa. Portado del flujo probado en el
// proyecto `libro-compra-ag` (Python) a Node con TLS client cert.
//
// Flujo:
//   1. Auth con certificado digital (TLS client cert) → cookies de sesión.
//   2. getResumen es solo un GATILLO async: dispara que el SII genere el
//      detalle en background; NO devuelve las filas.
//   3. getDetalleCompra trae las filas, pero hay que hacer POLLING con espera
//      creciente porque el SII las genera de forma asíncrona.
//
// El conversationId de cada request DEBE ser el valor de la cookie CSESSIONID
// (equivale al TOKEN). Sin eso el SII responde "El token no es valido".

const AUTH_HOST = "herculesr.sii.cl";
const AUTH_PATH = "/cgi_AUT2000/CAutInicio.cgi";
const AUTH_REFERENCIA =
  "https://www1.sii.cl/cgi-bin/Portal001/mipeAdminDocsRcp.cgi";
const RCV_HOST = "www4.sii.cl";
const RESUMEN_PATH =
  "/consdcvinternetui/services/data/facadeService/getResumen";
const DETALLE_PATH =
  "/consdcvinternetui/services/data/facadeService/getDetalleCompra";
const NS = "cl.sii.sdi.lob.diii.consdcv.data.api.interfaces.FacadeService";

// Tipos de documento de compra a descargar (factura afecta, exenta, NC, ND,
// factura de compra, liquidación factura).
const TIPOS_DOC = [33, 34, 56, 61];

// Polling acotado para caber en el maxDuration de la función serverless. Como
// el cron corre cada hora y el upsert es idempotente, no hace falta agotar la
// generación en una sola pasada: lo que falte lo toma la corrida siguiente.
const POLL_BASE_MS = 6000;
const POLL_STEP_MS = 4000;
const POLL_MAX_TRIES = 3;

type Cookies = Record<string, string>;

export type CompraRaw = Record<string, unknown>;

export type Compra = {
  periodo: string;
  tipoDoc: number;
  rutProveedor: string;
  razonSocial: string | null;
  folio: string;
  fechaEmision: string | null;
  fechaRecepcion: string | null;
  montoExento: number;
  montoNeto: number;
  montoIva: number;
  montoTotal: number;
  estadoContab: string;
  raw: CompraRaw;
};

function pemFromEnv(name: string): string {
  const b64 = process.env[name];
  if (!b64) throw new Error(`Falta la variable de entorno ${name}`);
  return Buffer.from(b64, "base64").toString("utf8");
}

function mergeSetCookie(jar: Cookies, setCookie?: string[]) {
  for (const raw of setCookie ?? []) {
    const [pair] = raw.split(";");
    const i = pair.indexOf("=");
    if (i < 0) continue;
    const k = pair.slice(0, i).trim();
    const v = pair.slice(i + 1).trim();
    if (raw.includes("01-Jan-1970")) delete jar[k];
    else if (k) jar[k] = v;
  }
}

function cookieHeader(jar: Cookies): string {
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

type ReqOpts = {
  host: string;
  path: string;
  method: "GET" | "POST";
  headers: Record<string, string>;
  cert: string;
  key: string;
};

function request(
  opts: ReqOpts,
  body?: string
): Promise<{ status: number; headers: IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: opts.host,
        port: 443,
        path: opts.path,
        method: opts.method,
        headers: opts.headers,
        cert: opts.cert,
        key: opts.key,
        // El SII presenta cadenas que Node no siempre valida; el canal sigue
        // cifrado y nos autenticamos con cert cliente.
        rejectUnauthorized: false,
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body: data })
        );
      }
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function num(row: CompraRaw, key: string): number {
  const v = row[key];
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : parseInt(String(v).replace(/\D/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

function str(row: CompraRaw, key: string): string | null {
  const v = row[key];
  return v == null || v === "" ? null : String(v);
}

// dd/mm/aaaa → aaaa-mm-dd (formato date de Postgres). El SII a veces trae
// fechas con hora; nos quedamos con la parte dd/mm/aaaa.
function fecha(row: CompraRaw, key: string): string | null {
  const v = str(row, key);
  if (!v) return null;
  const m = v.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

// El detalle del SII trae `detTipoDoc` en null: el tipo lo conocemos por el
// `codTipoDoc` con que se consultó, así que se pasa explícito.
function mapFila(row: CompraRaw, periodo: string, tipoDoc: number): Compra | null {
  const rut = str(row, "detRutDoc");
  const dv = str(row, "detDvDoc");
  const folio = str(row, "detNroDoc");
  if (!rut || !folio || !tipoDoc) return null;
  return {
    periodo,
    tipoDoc,
    rutProveedor: dv ? `${rut}-${dv}` : rut,
    razonSocial: str(row, "detRznSoc"),
    folio,
    fechaEmision: fecha(row, "detFchDoc"),
    fechaRecepcion: fecha(row, "detFecRecepcion"),
    montoExento: num(row, "detMntExe"),
    montoNeto: num(row, "detMntNeto"),
    montoIva: num(row, "detMntIVA"),
    montoTotal: num(row, "detMntTotal"),
    estadoContab: str(row, "dcvEstadoContab") ?? "REGISTRO",
    raw: row,
  };
}

type Sesion = { cert: string; key: string; jar: Cookies; convId: string };

// Autentica con el certificado y devuelve la sesión (cookies + conversationId).
async function autenticar(): Promise<Sesion> {
  const cert = pemFromEnv("SII_CERT_PEM_B64");
  const key = pemFromEnv("SII_KEY_PEM_B64");
  const rutTitular = (process.env.SII_RUT_TITULAR ?? "").trim(); // '14218294-7'
  if (!rutTitular.includes("-"))
    throw new Error("SII_RUT_TITULAR debe ser 'RUT-DV' (ej. 14218294-7)");
  const [rut, dv] = rutTitular.split("-");

  const params = new URLSearchParams({
    rutcntr: rutTitular,
    rut,
    dv,
    referencia: AUTH_REFERENCIA,
  }).toString();

  const jar: Cookies = {};
  const res = await request({
    host: AUTH_HOST,
    path: `${AUTH_PATH}?${params}`,
    method: "GET",
    headers: { "User-Agent": "Mozilla/5.0" },
    cert,
    key,
  });
  if (res.body.includes("01.01.215.500.440.33"))
    throw new Error("Certificado inválido o rechazado por el SII");
  mergeSetCookie(jar, res.headers["set-cookie"]);
  const convId = jar.CSESSIONID || jar.TOKEN;
  if (!convId)
    throw new Error("Auth SII sin cookie de sesión (CSESSIONID/TOKEN)");
  return { cert, key, jar, convId };
}

function jsonHeaders(jar: Cookies, len: number): Record<string, string> {
  return {
    accept: "application/json, text/plain, */*",
    "content-type": "application/json",
    "user-agent": "Mozilla/5.0",
    referer: "https://www4.sii.cl/consdcvinternetui/",
    origin: "https://www4.sii.cl",
    "content-length": String(len),
    cookie: cookieHeader(jar),
  };
}

// Dispara la generación del detalle (no devuelve filas).
async function gatillarResumen(
  s: Sesion,
  rutEmisor: string,
  dvEmisor: string,
  periodo: string
) {
  const payload = JSON.stringify({
    metaData: {
      namespace: `${NS}/getResumen`,
      conversationId: s.convId,
      transactionId: randomUUID(),
      page: null,
    },
    data: {
      rutEmisor,
      dvEmisor,
      ptributario: periodo,
      estadoContab: "REGISTRO",
      operacion: "COMPRA",
      busquedaInicial: true,
    },
  });
  try {
    await request(
      {
        host: RCV_HOST,
        path: RESUMEN_PATH,
        method: "POST",
        headers: jsonHeaders(s.jar, Buffer.byteLength(payload)),
        cert: s.cert,
        key: s.key,
      },
      payload
    );
  } catch {
    // El resumen es solo un gatillo; si falla seguimos al detalle igual.
  }
}

async function pedirDetalle(
  s: Sesion,
  rutEmisor: string,
  dvEmisor: string,
  periodo: string,
  codTipoDoc: number
): Promise<CompraRaw[] | null> {
  const payload = JSON.stringify({
    metaData: {
      namespace: `${NS}/getDetalleCompra`,
      conversationId: s.convId,
      transactionId: randomUUID(),
      page: null,
    },
    data: {
      rutEmisor,
      dvEmisor,
      ptributario: periodo,
      codTipoDoc: String(codTipoDoc),
      operacion: "COMPRA",
      estadoContab: "REGISTRO",
      accionRecaptcha: "RCV_DETC",
      tokenRecaptcha: "t-o-k-e-n-web",
    },
  });
  try {
    const res = await request(
      {
        host: RCV_HOST,
        path: DETALLE_PATH,
        method: "POST",
        headers: jsonHeaders(s.jar, Buffer.byteLength(payload)),
        cert: s.cert,
        key: s.key,
      },
      payload
    );
    if (res.status !== 200) return null;
    const json = JSON.parse(res.body) as { data?: CompraRaw[] };
    return json.data ?? [];
  } catch {
    return null;
  }
}

// Fetch-until-stable: re-dispara el resumen y reintenta el detalle con espera
// creciente; se queda con el resultado más grande hasta que el conteo se
// estabiliza o se agotan los intentos.
async function detalleEstable(
  s: Sesion,
  rutEmisor: string,
  dvEmisor: string,
  periodo: string,
  codTipoDoc: number
): Promise<CompraRaw[]> {
  let best: CompraRaw[] = [];
  let stable = 0;
  for (let i = 0; i < POLL_MAX_TRIES; i++) {
    await gatillarResumen(s, rutEmisor, dvEmisor, periodo);
    await sleep(POLL_BASE_MS + i * POLL_STEP_MS);
    const data = await pedirDetalle(s, rutEmisor, dvEmisor, periodo, codTipoDoc);
    if (data == null) continue;
    if (data.length > best.length) {
      best = data;
      stable = 0;
    } else if (data.length === best.length && best.length > 0) {
      stable += 1;
      if (stable >= 2) break;
    }
  }
  return best;
}

// Descarga todas las compras de los periodos dados. Devuelve la lista mapeada
// y deduplicada por (tipoDoc, rutProveedor, folio).
export async function descargarCompras(periodos: string[]): Promise<Compra[]> {
  const rutEmpresa = (process.env.SII_RUT_EMPRESA ?? "").trim(); // '78400766-9'
  if (!rutEmpresa.includes("-"))
    throw new Error("SII_RUT_EMPRESA debe ser 'RUT-DV' (ej. 78400766-9)");
  const [rutEmisor, dvEmisor] = rutEmpresa.split("-");

  const s = await autenticar();
  const porClave = new Map<string, Compra>();

  for (const periodo of periodos) {
    for (const tipoDoc of TIPOS_DOC) {
      const filas = await detalleEstable(s, rutEmisor, dvEmisor, periodo, tipoDoc);
      for (const row of filas) {
        const compra = mapFila(row, periodo, tipoDoc);
        if (!compra) continue;
        porClave.set(
          `${compra.tipoDoc}|${compra.rutProveedor}|${compra.folio}`,
          compra
        );
      }
    }
  }

  return [...porClave.values()];
}
