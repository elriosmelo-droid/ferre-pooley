# Ventas: filtros + PDF del DTE Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** En `/ventas`, filtrar facturas (fecha/cliente/tipo) y ver el PDF de cada DTE descargado del SII MIPE.

**Architecture:** El parser de XML y el render de PDF son módulos puros (testables). El cliente MIPE hace la descarga autenticada con cert. Una route orquesta: caché en Supabase Storage → si falta, baja XML del SII, parsea, renderiza PDF, sube a Storage, lo sirve. La UI pasa a un Client Component con filtros en memoria.

**Tech Stack:** Next.js (App Router), TypeScript, vitest, `@react-pdf/renderer`, `@supabase/supabase-js` (service role), Node `https` + TLS client cert.

## Global Constraints

- Antes de escribir Next.js/route handlers, leer la guía relevante en `node_modules/next/dist/docs/` (ver AGENTS.md — esta versión tiene breaking changes).
- Cert SII se lee de env (`SII_CERT_PEM_B64`, `SII_KEY_PEM_B64`), nunca del repo. Módulos que lo usan llevan `import "server-only"`.
- Empresa: `SII_RUT_EMPRESA=78400766-9`, titular cert `SII_RUT_TITULAR=14218294-7`.
- Commits sin trailer Co-Author; autor `Elvis Rios <elriosmelo@gmail.com>` (ya es el git config).
- Montos en CLP enteros; formato con `formatCLP` de `@/lib/money`.
- Tests con `vitest run` (script `npm test`).

---

### Task 1: Parser del XML del DTE

**Files:**
- Create: `src/lib/sii/dte-xml.ts`
- Test: `src/lib/sii/dte-xml.test.ts`
- Fixture (ya copiada): `src/lib/sii/__fixtures__/dte21.xml`

**Interfaces:**
- Consumes: nada.
- Produces:
  ```ts
  export type DteItem = { nombre: string; cantidad: number; unidad: string | null; precio: number; monto: number };
  export type DteParsed = {
    tipoDte: number; folio: string; fchEmis: string;
    emisor: { rut: string; rznSoc: string; giro: string | null; dir: string | null };
    receptor: { rut: string; rznSoc: string; giro: string | null; dir: string | null };
    items: DteItem[];
    montoNeto: number; iva: number; exento: number; total: number;
  };
  export function parseDte(xml: string): DteParsed;
  ```

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/sii/dte-xml.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseDte } from "./dte-xml";

const xml = readFileSync(join(__dirname, "__fixtures__/dte21.xml"), "latin1");

describe("parseDte", () => {
  it("extrae encabezado, receptor, items y totales del DTE real", () => {
    const d = parseDte(xml);
    expect(d.tipoDte).toBe(33);
    expect(d.folio).toBe("21");
    expect(d.fchEmis).toBe("2026-06-25");
    expect(d.emisor.rut).toBe("78400766-9");
    expect(d.emisor.rznSoc).toBe("TULBLESS SPA");
    expect(d.receptor.rut).toBe("77264557-0");
    expect(d.receptor.rznSoc).toBe("PRO LOGÍSTICA LOS RIOS LIMITADA");
    expect(d.montoNeto).toBe(14695200);
    expect(d.iva).toBe(2792088);
    expect(d.total).toBe(17487288);
    expect(d.items).toHaveLength(1);
    expect(d.items[0].nombre).toBe("TERCIADO ESTRUCTURAL");
    expect(d.items[0].cantidad).toBe(936);
    expect(d.items[0].precio).toBe(15700);
    expect(d.items[0].monto).toBe(14695200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- dte-xml`
Expected: FAIL ("parseDte is not a function" / módulo no encontrado).

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/sii/dte-xml.ts
// Parser mínimo (regex) del XML de un DTE emitido (SetDTE/Documento) del SII.
// No valida firma; solo extrae los campos para mostrar el documento.

export type DteItem = {
  nombre: string;
  cantidad: number;
  unidad: string | null;
  precio: number;
  monto: number;
};

export type DteParsed = {
  tipoDte: number;
  folio: string;
  fchEmis: string;
  emisor: { rut: string; rznSoc: string; giro: string | null; dir: string | null };
  receptor: { rut: string; rznSoc: string; giro: string | null; dir: string | null };
  items: DteItem[];
  montoNeto: number;
  iva: number;
  exento: number;
  total: number;
};

function tag(src: string, name: string): string | null {
  const m = src.match(new RegExp(`<${name}>([^<]*)</${name}>`));
  return m ? m[1].trim() : null;
}
function intTag(src: string, name: string): number {
  const v = tag(src, name);
  if (!v) return 0;
  const n = parseInt(v.replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}
function numTag(src: string, name: string): number {
  const v = tag(src, name);
  if (!v) return 0;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}
function block(src: string, name: string): string {
  const m = src.match(new RegExp(`<${name}[\\s>]([\\s\\S]*?)</${name}>`));
  return m ? m[1] : "";
}

export function parseDte(xml: string): DteParsed {
  const enc = block(xml, "Encabezado");
  const emisorB = block(enc, "Emisor");
  const recepB = block(enc, "Receptor");
  const totB = block(enc, "Totales");
  const idB = block(enc, "IdDoc");

  const items: DteItem[] = [];
  const re = /<Detalle>([\s\S]*?)<\/Detalle>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const d = m[1];
    items.push({
      nombre: tag(d, "NmbItem") ?? "",
      cantidad: numTag(d, "QtyItem"),
      unidad: tag(d, "UnmdItem"),
      precio: numTag(d, "PrcItem"),
      monto: intTag(d, "MontoItem"),
    });
  }

  return {
    tipoDte: intTag(idB, "TipoDTE"),
    folio: tag(idB, "Folio") ?? "",
    fchEmis: tag(idB, "FchEmis") ?? "",
    emisor: {
      rut: tag(emisorB, "RUTEmisor") ?? "",
      rznSoc: tag(emisorB, "RznSoc") ?? "",
      giro: tag(emisorB, "GiroEmis"),
      dir: tag(emisorB, "DirOrigen"),
    },
    receptor: {
      rut: tag(recepB, "RUTRecep") ?? "",
      rznSoc: tag(recepB, "RznSocRecep") ?? "",
      giro: tag(recepB, "GiroRecep"),
      dir: tag(recepB, "DirRecep"),
    },
    items,
    montoNeto: intTag(totB, "MntNeto"),
    iva: intTag(totB, "IVA"),
    exento: intTag(totB, "MntExe"),
    total: intTag(totB, "MntTotal"),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- dte-xml`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sii/dte-xml.ts src/lib/sii/dte-xml.test.ts src/lib/sii/__fixtures__/dte21.xml
git commit -m "Parser del XML del DTE emitido (SII)"
```

---

### Task 2: Cliente SII MIPE (descarga del DTE emitido)

**Files:**
- Create: `src/lib/sii/mipe.ts`

**Interfaces:**
- Consumes: env `SII_CERT_PEM_B64`, `SII_KEY_PEM_B64`, `SII_RUT_TITULAR`, `SII_RUT_EMPRESA`.
- Produces:
  ```ts
  // Devuelve el bloque <DTE>...</DTE> cuyo folio+tipo calzan, o null si no aparece.
  export function descargarDteEmitidoXml(args: { fecha: string; folio: string; tipoDoc: number }): Promise<string | null>;
  ```
  `fecha` en formato `aaaa-mm-dd`.

> No lleva test unitario: depende de la red del SII y ya se validó con el spike (auth 200, XML del folio 21 descargado). Verificación manual en Task 6.

- [ ] **Step 1: Escribir el cliente**

```ts
// src/lib/sii/mipe.ts
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
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores en `mipe.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/sii/mipe.ts
git commit -m "Cliente SII MIPE: descarga del XML del DTE emitido por folio"
```

---

### Task 3: Componente PDF de la venta

**Files:**
- Create: `src/lib/pdf/venta-pdf.tsx`
- Reference: `src/lib/pdf/orden-compra-pdf.tsx` (estilo, logo, `renderToBuffer`)

**Interfaces:**
- Consumes: `DteParsed` de Task 1 (`@/lib/sii/dte-xml`), `EMPRESA` de `@/lib/empresa`, `formatCLP` de `@/lib/money`, `LOGO_DATA_URI` de `./logo-data`.
- Produces:
  ```ts
  export function generarPdfVenta(dte: DteParsed): Promise<Buffer>;
  ```

- [ ] **Step 1: Escribir el componente y el helper**

```tsx
// src/lib/pdf/venta-pdf.tsx
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
import { EMPRESA } from "@/lib/empresa";
import type { DteParsed } from "@/lib/sii/dte-xml";
import { LOGO_DATA_URI } from "./logo-data";

const TIPO_DOC: Record<number, string> = {
  33: "Factura electrónica",
  34: "Factura exenta electrónica",
  56: "Nota de débito electrónica",
  61: "Nota de crédito electrónica",
};

const s = StyleSheet.create({
  page: { padding: 32, fontSize: 9, color: "#0f172a", fontFamily: "Helvetica" },
  row: { flexDirection: "row", justifyContent: "space-between" },
  logo: { width: 130 },
  docBox: { borderWidth: 1, borderColor: "#dc2626", borderRadius: 4, padding: 8, width: 170, alignItems: "center" },
  docTipo: { color: "#dc2626", fontFamily: "Helvetica-Bold", fontSize: 10, textAlign: "center" },
  docFolio: { fontFamily: "Helvetica-Bold", fontSize: 14, marginTop: 4 },
  section: { marginTop: 16 },
  label: { color: "#64748b", fontSize: 8 },
  bold: { fontFamily: "Helvetica-Bold" },
  th: { flexDirection: "row", backgroundColor: "#f1f5f9", paddingVertical: 5, paddingHorizontal: 6, marginTop: 12 },
  td: { flexDirection: "row", paddingVertical: 5, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: "#e2e8f0" },
  cDesc: { flex: 4 },
  cQty: { flex: 1, textAlign: "right" },
  cPrc: { flex: 1.5, textAlign: "right" },
  cTot: { flex: 1.5, textAlign: "right" },
  totals: { marginTop: 12, alignSelf: "flex-end", width: 200 },
  totRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  totFinal: { fontFamily: "Helvetica-Bold", fontSize: 11, marginTop: 4, borderTopWidth: 1, borderTopColor: "#0f172a", paddingTop: 4 },
});

function VentaPdf({ dte }: { dte: DteParsed }) {
  const [y, m, d] = dte.fchEmis.split("-");
  const fecha = y ? `${d}/${m}/${y}` : dte.fchEmis;
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.row}>
          <View>
            <Image style={s.logo} src={LOGO_DATA_URI} />
            <Text style={[s.bold, { marginTop: 6 }]}>{dte.emisor.rznSoc}</Text>
            {dte.emisor.giro ? <Text style={s.label}>{dte.emisor.giro}</Text> : null}
            <Text style={s.label}>RUT {dte.emisor.rut}</Text>
            {dte.emisor.dir ? <Text style={s.label}>{dte.emisor.dir}</Text> : null}
          </View>
          <View style={s.docBox}>
            <Text style={s.docTipo}>{TIPO_DOC[dte.tipoDte] ?? `Documento ${dte.tipoDte}`}</Text>
            <Text style={s.docFolio}>N° {dte.folio}</Text>
            <Text style={s.label}>Fecha: {fecha}</Text>
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.label}>Receptor</Text>
          <Text style={s.bold}>{dte.receptor.rznSoc}</Text>
          <Text style={s.label}>RUT {dte.receptor.rut}</Text>
          {dte.receptor.giro ? <Text style={s.label}>{dte.receptor.giro}</Text> : null}
          {dte.receptor.dir ? <Text style={s.label}>{dte.receptor.dir}</Text> : null}
        </View>

        <View style={s.th}>
          <Text style={[s.cDesc, s.bold]}>Detalle</Text>
          <Text style={[s.cQty, s.bold]}>Cant.</Text>
          <Text style={[s.cPrc, s.bold]}>Precio</Text>
          <Text style={[s.cTot, s.bold]}>Monto</Text>
        </View>
        {dte.items.map((it, i) => (
          <View style={s.td} key={i}>
            <Text style={s.cDesc}>{it.nombre}{it.unidad ? ` (${it.unidad})` : ""}</Text>
            <Text style={s.cQty}>{it.cantidad}</Text>
            <Text style={s.cPrc}>{formatCLP(it.precio)}</Text>
            <Text style={s.cTot}>{formatCLP(it.monto)}</Text>
          </View>
        ))}

        <View style={s.totals}>
          {dte.exento > 0 ? (
            <View style={s.totRow}><Text>Exento</Text><Text>{formatCLP(dte.exento)}</Text></View>
          ) : null}
          <View style={s.totRow}><Text>Neto</Text><Text>{formatCLP(dte.montoNeto)}</Text></View>
          <View style={s.totRow}><Text>IVA (19%)</Text><Text>{formatCLP(dte.iva)}</Text></View>
          <View style={[s.totRow, s.totFinal]}><Text>Total</Text><Text>{formatCLP(dte.total)}</Text></View>
        </View>

        <Text style={[s.label, { marginTop: 24 }]}>
          {EMPRESA.nombre} · {EMPRESA.direccion} · Documento generado desde el SII.
        </Text>
      </Page>
    </Document>
  );
}

export function generarPdfVenta(dte: DteParsed): Promise<Buffer> {
  return renderToBuffer(<VentaPdf dte={dte} />);
}
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores en `venta-pdf.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/pdf/venta-pdf.tsx
git commit -m "Componente PDF de la venta (DTE con detalle)"
```

---

### Task 4: Route con caché en Supabase Storage

**Files:**
- Create: `src/app/(app)/ventas/[id]/pdf/route.ts`
- Reference: `src/lib/supabase/admin.ts` (`createAdminClient`)

**Interfaces:**
- Consumes: `descargarDteEmitidoXml` (Task 2), `parseDte` (Task 1), `generarPdfVenta` (Task 3), `createAdminClient`.
- Produces: GET handler que responde `application/pdf` inline.

**Pre-requisito:** bucket de Storage `ventas-pdf` creado (Task 6, paso manual). Si no existe, el handler responde el PDF igual (genera on-demand) pero loguea el fallo de subida.

- [ ] **Step 1: Leer la guía de route handlers**

Run: `ls node_modules/next/dist/docs/` y leer la sección de route handlers / dynamic params (params puede ser async en esta versión).

- [ ] **Step 2: Escribir el route handler**

```ts
// src/app/(app)/ventas/[id]/pdf/route.ts
import { createAdminClient } from "@/lib/supabase/admin";
import { descargarDteEmitidoXml } from "@/lib/sii/mipe";
import { parseDte } from "@/lib/sii/dte-xml";
import { generarPdfVenta } from "@/lib/pdf/venta-pdf";

export const maxDuration = 60;

const BUCKET = "ventas-pdf";

function pdfResponse(buf: Buffer, folio: string) {
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="venta-${folio}.pdf"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createAdminClient();

  const { data: venta, error } = await db
    .from("ventas_sii")
    .select("id, folio, tipo_doc, fecha_emision")
    .eq("id", id)
    .single();
  if (error || !venta) {
    return new Response("Venta no encontrada", { status: 404 });
  }

  const key = `${id}.pdf`;

  // 1. Caché
  const cached = await db.storage.from(BUCKET).download(key);
  if (cached.data) {
    const buf = Buffer.from(await cached.data.arrayBuffer());
    return pdfResponse(buf, venta.folio);
  }

  // 2. Miss → bajar del SII
  if (!venta.fecha_emision) {
    return new Response("La venta no tiene fecha de emisión", { status: 422 });
  }
  let xml: string | null;
  try {
    xml = await descargarDteEmitidoXml({
      fecha: venta.fecha_emision,
      folio: venta.folio,
      tipoDoc: venta.tipo_doc,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    const status = msg.includes("429") ? 503 : 502;
    return new Response(`No se pudo obtener el DTE del SII: ${msg}`, { status });
  }
  if (!xml) {
    return new Response("No se encontró el DTE en el SII", { status: 404 });
  }

  const buf = await generarPdfVenta(parseDte(xml));

  // 3. Cachear (best-effort; si el bucket no existe, igual se sirve)
  const up = await db.storage
    .from(BUCKET)
    .upload(key, new Uint8Array(buf), { contentType: "application/pdf", upsert: true });
  if (up.error) console.error("No se pudo cachear el PDF en Storage:", up.error.message);

  return pdfResponse(buf, venta.folio);
}
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/ventas/[id]/pdf/route.ts"
git commit -m "Route /ventas/[id]/pdf: baja DTE del SII, cachea en Storage y sirve PDF"
```

---

### Task 5: UI — filtros + columna Ver

**Files:**
- Create: `src/app/(app)/ventas/ventas-tabla.tsx`
- Modify: `src/app/(app)/ventas/page.tsx`

**Interfaces:**
- Consumes: las ventas que `page.tsx` ya consulta.
- Produces: Client Component `VentasTabla` que recibe `ventas` y renderiza filtros + tabla + columna Ver.

- [ ] **Step 1: Crear el Client Component**

```tsx
// src/app/(app)/ventas/ventas-tabla.tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatCLP } from "@/lib/money";

const TIPO_DOC: Record<number, string> = {
  33: "Factura electrónica",
  34: "Factura exenta",
  56: "Nota de débito",
  61: "Nota de crédito",
};

export type VentaRow = {
  id: string;
  tipo_doc: number;
  rut_cliente: string;
  razon_social: string | null;
  folio: string;
  fecha_emision: string | null;
  monto_total: number;
  notas_venta: { id: string; folio: string } | null;
};

function formatFecha(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function VentasTabla({ ventas }: { ventas: VentaRow[] }) {
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [cliente, setCliente] = useState("");
  const [tipo, setTipo] = useState("");

  const filtradas = useMemo(() => {
    const q = cliente.trim().toLowerCase();
    return ventas.filter((v) => {
      if (desde && (!v.fecha_emision || v.fecha_emision < desde)) return false;
      if (hasta && (!v.fecha_emision || v.fecha_emision > hasta)) return false;
      if (tipo && String(v.tipo_doc) !== tipo) return false;
      if (q) {
        const hay = `${v.razon_social ?? ""} ${v.rut_cliente}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [ventas, desde, hasta, cliente, tipo]);

  const total = filtradas.reduce((sum, v) => sum + v.monto_total, 0);
  const tipos = Array.from(new Set(ventas.map((v) => v.tipo_doc))).sort((a, b) => a - b);

  const inputCls =
    "rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none";

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          Desde
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          Hasta
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          Cliente / RUT
          <input
            type="text"
            value={cliente}
            onChange={(e) => setCliente(e.target.value)}
            placeholder="Buscar…"
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          Tipo
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={inputCls}>
            <option value="">Todos</option>
            {tipos.map((t) => (
              <option key={t} value={t}>{TIPO_DOC[t] ?? `Tipo ${t}`}</option>
            ))}
          </select>
        </label>
        {(desde || hasta || cliente || tipo) && (
          <button
            type="button"
            onClick={() => { setDesde(""); setHasta(""); setCliente(""); setTipo(""); }}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            Limpiar
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Documento</th>
              <th className="px-4 py-3">Folio SII</th>
              <th className="px-4 py-3">Nota de venta</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3 text-center">PDF</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtradas.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  No hay ventas que coincidan con los filtros.
                </td>
              </tr>
            ) : (
              filtradas.map((v) => (
                <tr key={v.id} className="text-slate-700">
                  <td className="px-4 py-3 whitespace-nowrap">{formatFecha(v.fecha_emision)}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{v.razon_social ?? "—"}</div>
                    <div className="text-xs text-slate-500">{v.rut_cliente}</div>
                  </td>
                  <td className="px-4 py-3">{TIPO_DOC[v.tipo_doc] ?? `Tipo ${v.tipo_doc}`}</td>
                  <td className="px-4 py-3">{v.folio}</td>
                  <td className="px-4 py-3">
                    {v.notas_venta ? (
                      <Link href={`/notas-venta/${v.notas_venta.id}`} className="font-medium text-brand-600 hover:text-brand-800">
                        {v.notas_venta.folio}
                      </Link>
                    ) : (
                      <span className="text-slate-400">Sin vincular</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-slate-900">{formatCLP(v.monto_total)}</td>
                  <td className="px-4 py-3 text-center">
                    <a
                      href={`/ventas/${v.id}/pdf`}
                      target="_blank"
                      rel="noopener"
                      className="font-medium text-brand-600 hover:text-brand-800"
                    >
                      Ver
                    </a>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {filtradas.length > 0 && (
            <tfoot className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-900">
              <tr>
                <td className="px-4 py-3" colSpan={5}>
                  {filtradas.length} venta{filtradas.length === 1 ? "" : "s"}
                </td>
                <td className="px-4 py-3 text-right">{formatCLP(total)}</td>
                <td className="px-4 py-3" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Reemplazar la tabla en `page.tsx` por el Client Component**

Sustituir el bloque del `<table>` (y el tipo `VentaRow`/`formatFecha`/`TIPO_DOC` locales) por el render del componente nuevo. `page.tsx` queda:

```tsx
import { createClient } from "@/lib/supabase/server";
import { ActualizarVentasButton } from "./actualizar-button";
import { VentasTabla, type VentaRow } from "./ventas-tabla";

export const maxDuration = 300;

export default async function VentasPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("ventas_sii")
    .select(
      "id, tipo_doc, rut_cliente, razon_social, folio, fecha_emision, monto_total, notas_venta(id, folio)"
    )
    .order("fecha_emision", { ascending: false, nullsFirst: false })
    .order("folio", { ascending: false });

  const ventas = (data ?? []) as unknown as VentaRow[];

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Ventas</h1>
          <p className="mt-1 text-sm text-slate-500">
            Facturas emitidas del SII, vinculadas con sus notas de venta. Se
            actualizan cada noche; también puedes refrescarlas a mano.
          </p>
        </div>
        <ActualizarVentasButton />
      </div>

      {error ? (
        <p className="text-sm text-red-600">
          No se pudieron cargar las ventas. Intenta nuevamente.
        </p>
      ) : (
        <VentasTabla ventas={ventas} />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verificar build/typecheck**

Run: `npx tsc --noEmit && npm run lint`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/ventas/page.tsx" "src/app/(app)/ventas/ventas-tabla.tsx"
git commit -m "Filtros (fecha/cliente/tipo) y columna Ver PDF en /ventas"
```

---

### Task 6: Bucket de Storage, env local y verificación manual

**Files:** ninguno (configuración + verificación).

- [ ] **Step 1: Crear el bucket privado `ventas-pdf`**

En el dashboard de Supabase → Storage → New bucket: nombre `ventas-pdf`, **Public = off**. (La route lo lee/escribe con service role, salta RLS.)

- [ ] **Step 2: Cargar el cert SII en `.env.local`** (para probar local)

Agregar a `.env.local` (valores ya en Vercel): `SII_CERT_PEM_B64`, `SII_KEY_PEM_B64`, `SII_RUT_TITULAR=14218294-7`, `SII_RUT_EMPRESA=78400766-9`. Generar los b64 desde el PEM si hace falta:

```bash
base64 -w0 < scratchpad/cert.pem   # → SII_CERT_PEM_B64
base64 -w0 < scratchpad/key.pem    # → SII_KEY_PEM_B64
```

- [ ] **Step 3: Levantar la app y probar**

Run: `npm run dev`
Verificar en `/ventas`:
1. Filtros: rango fechas, texto cliente (ej. "TOQUI"), tipo doc → la tabla y los totales reaccionan.
2. Click "Ver" en folio 21 → abre PDF con detalle (TERCIADO ESTRUCTURAL x936, total $17.487.288).
3. Segundo "Ver" del mismo folio → carga rápido (desde Storage). Confirmar objeto `21.pdf`... (la key es `{id}.pdf`) en el bucket.

- [ ] **Step 4: Commit (si hubo ajustes) y cierre**

Si todo anduvo sin cambios de código, no hay commit. Si hubo fixes, commitear con mensaje descriptivo.

---

## Notas de despliegue

- Deploy es **manual por CLI**: `vercel --prod --yes` (el push a GitHub no auto-despliega este proyecto).
- Env vars SII ya están en Vercel. El bucket `ventas-pdf` debe existir en el mismo proyecto Supabase de producción.
- Sin migración SQL.
