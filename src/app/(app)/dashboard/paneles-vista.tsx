"use client";

import { useMemo, useState } from "react";
import { formatCLP } from "@/lib/money";
import { signoDte } from "@/lib/dte-doc";

// Series: ventas verde, compras rojo (paleta validada; se refuerza con forma
// distinta — círculo vs rombo — para no depender solo del color).
const VERDE = "#16a34a";
const ROJO = "#dc2626";

export type DocSii = {
  fecha: string | null; // 'AAAA-MM-DD' (emisión)
  tipo_doc: number;
  neto: number;
  iva: number;
  total: number;
  conciliada: boolean;
};

export type NotaPagada = { fecha: string; total: number };

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function etiquetaMes(clave: string): string {
  const [anio, mes] = clave.split("-").map(Number);
  return `${MESES[mes - 1]} ${String(anio).slice(2)}`;
}
function hoyChile(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
}
function inicioMesAtras(desde: string, meses: number): string {
  let [anio, mes] = desde.slice(0, 7).split("-").map(Number);
  mes -= meses;
  while (mes <= 0) {
    mes += 12;
    anio -= 1;
  }
  return `${anio}-${String(mes).padStart(2, "0")}-01`;
}
function esFactura(tipo: number): boolean {
  return tipo === 33 || tipo === 34;
}
const clpCorto = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (a >= 1_000) return `$${Math.round(n / 1000)}k`;
  return `$${n}`;
};

const PRESETS = [
  { id: "mes", label: "Este mes" },
  { id: "3m", label: "3 meses" },
  { id: "6m", label: "6 meses" },
  { id: "12m", label: "12 meses" },
  { id: "todo", label: "Todo" },
] as const;

const inputCls =
  "rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none";

export function PanelesSiiVista({
  ventas,
  compras,
  notasPagadas,
}: {
  ventas: DocSii[];
  compras: DocSii[];
  notasPagadas: NotaPagada[];
}) {
  const hoy = hoyChile();
  const [desde, setDesde] = useState(() => `${hoy.slice(0, 7)}-01`); // mes en curso
  const [hasta, setHasta] = useState(hoy);
  const [preset, setPreset] = useState<string>("mes");

  function aplicarPreset(id: string) {
    setPreset(id);
    setHasta(hoy);
    if (id === "mes") setDesde(`${hoy.slice(0, 7)}-01`);
    else if (id === "3m") setDesde(inicioMesAtras(hoy, 2));
    else if (id === "6m") setDesde(inicioMesAtras(hoy, 5));
    else if (id === "12m") setDesde(inicioMesAtras(hoy, 11));
    else setDesde("");
  }

  const enRango = (fecha: string | null) =>
    !!fecha && (!desde || fecha >= desde) && (!hasta || fecha <= hasta);

  // --- Panel 1: por día ---
  const diario = useMemo(() => {
    const dias = new Map<string, { vMonto: number; vCant: number; cMonto: number; cCant: number }>();
    const get = (f: string) => {
      let d = dias.get(f);
      if (!d) {
        d = { vMonto: 0, vCant: 0, cMonto: 0, cCant: 0 };
        dias.set(f, d);
      }
      return d;
    };
    let vMontoT = 0, vCantT = 0, cMontoT = 0, cCantT = 0;
    for (const v of ventas) {
      if (!enRango(v.fecha)) continue;
      const m = signoDte(v.tipo_doc) * v.total;
      get(v.fecha!.slice(0, 10)).vMonto += m;
      get(v.fecha!.slice(0, 10)).vCant += 1;
      vMontoT += m;
      vCantT += 1;
    }
    for (const c of compras) {
      if (!enRango(c.fecha)) continue;
      const m = signoDte(c.tipo_doc) * c.total;
      get(c.fecha!.slice(0, 10)).cMonto += m;
      get(c.fecha!.slice(0, 10)).cCant += 1;
      cMontoT += m;
      cCantT += 1;
    }
    const filas = [...dias.entries()]
      .map(([fecha, d]) => ({ fecha, ...d }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
    return { filas, vMontoT, vCantT, cMontoT, cCantT };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ventas, compras, desde, hasta]);

  // --- Panel 2: ciclo de venta ---
  const ciclo = useMemo(() => {
    let fMonto = 0, fCant = 0, cMonto = 0, cCant = 0;
    for (const v of ventas) {
      if (!enRango(v.fecha) || !esFactura(v.tipo_doc)) continue;
      fMonto += v.total;
      fCant += 1;
      if (v.conciliada) {
        cMonto += v.total;
        cCant += 1;
      }
    }
    let pMonto = 0, pCant = 0;
    for (const n of notasPagadas) {
      if (!enRango(n.fecha)) continue;
      pMonto += n.total;
      pCant += 1;
    }
    return { fMonto, fCant, cMonto, cCant, pMonto, pCant };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ventas, notasPagadas, desde, hasta]);

  // --- Panel 3: IVA mensual ---
  const iva = useMemo(() => {
    const meses = new Map<string, { debito: number; credito: number }>();
    const get = (f: string) => {
      const clave = f.slice(0, 7);
      let m = meses.get(clave);
      if (!m) {
        m = { debito: 0, credito: 0 };
        meses.set(clave, m);
      }
      return m;
    };
    let debitoT = 0, creditoT = 0;
    for (const v of ventas) {
      if (!enRango(v.fecha)) continue;
      const x = signoDte(v.tipo_doc) * v.iva;
      get(v.fecha!).debito += x;
      debitoT += x;
    }
    for (const c of compras) {
      if (!enRango(c.fecha)) continue;
      const x = signoDte(c.tipo_doc) * c.iva;
      get(c.fecha!).credito += x;
      creditoT += x;
    }
    const filas = [...meses.entries()]
      .map(([clave, m]) => ({ clave, ...m, pagar: m.debito - m.credito }))
      .sort((a, b) => a.clave.localeCompare(b.clave));
    return { filas, debitoT, creditoT, pagarT: debitoT - creditoT };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ventas, compras, desde, hasta]);

  return (
    <div className="flex flex-col gap-6">
      {/* Filtro compartido */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white px-6 py-4">
        <div className="flex flex-wrap gap-1">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => aplicarPreset(p.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                preset === p.id
                  ? "bg-brand-600 text-white"
                  : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          Desde
          <input type="date" value={desde} onChange={(e) => { setDesde(e.target.value); setPreset(""); }} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          Hasta
          <input type="date" value={hasta} onChange={(e) => { setHasta(e.target.value); setPreset(""); }} className={inputCls} />
        </label>
      </div>

      <Panel1 diario={diario} />
      <Panel2 ciclo={ciclo} />
      <Panel3 iva={iva} />
    </div>
  );
}

// ---------- Panel 1: dispersión diaria ventas vs compras ----------
function Panel1({
  diario,
}: {
  diario: {
    filas: { fecha: string; vMonto: number; vCant: number; cMonto: number; cCant: number }[];
    vMontoT: number; vCantT: number; cMontoT: number; cCantT: number;
  };
}) {
  const { filas } = diario;
  const W = 760, H = 240, padL = 60, padR = 14, padT = 12, padB = 30;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const valores = filas.flatMap((f) => [f.vMonto, f.cMonto]);
  const yMax = Math.max(1, ...valores);
  const yMin = Math.min(0, ...valores);
  const xFor = (i: number) =>
    padL + (filas.length <= 1 ? innerW / 2 : (i / (filas.length - 1)) * innerW);
  const yFor = (v: number) => padT + innerH - ((v - yMin) / (yMax - yMin)) * innerH;
  const y0 = yFor(0);
  const ticks = [yMin, yMin + (yMax - yMin) / 2, yMax];

  return (
    <Card
      titulo="Ventas vs compras por día"
      leyenda={
        <>
          <Chip color={VERDE} forma="circulo">Ventas</Chip>
          <Chip color={ROJO} forma="rombo">Compras</Chip>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Ventas (monto)" value={formatCLP(diario.vMontoT)} color={VERDE} />
        <Tile label="Ventas (facturas)" value={String(diario.vCantT)} color={VERDE} />
        <Tile label="Compras (monto)" value={formatCLP(diario.cMontoT)} color={ROJO} />
        <Tile label="Compras (facturas)" value={String(diario.cCantT)} color={ROJO} />
      </div>

      {filas.length === 0 ? (
        <Vacio />
      ) : (
        <div className="overflow-x-auto">
          <svg viewBox={`0 0 ${W} ${H}`} className="min-w-[640px] w-full" role="img" aria-label="Dispersión de ventas y compras por día">
            {ticks.map((t, i) => (
              <g key={i}>
                <line x1={padL} y1={yFor(t)} x2={W - padR} y2={yFor(t)} stroke="#e2e8f0" strokeWidth={1} />
                <text x={padL - 8} y={yFor(t) + 3} textAnchor="end" fontSize="10" fill="#94a3b8">{clpCorto(Math.round(t))}</text>
              </g>
            ))}
            <line x1={padL} y1={y0} x2={W - padR} y2={y0} stroke="#cbd5e1" strokeWidth={1} />
            {filas.map((f, i) => {
              const x = xFor(i);
              const dia = Number(f.fecha.slice(8, 10));
              const paso = Math.ceil(filas.length / 12);
              return (
                <g key={f.fecha}>
                  {(i % paso === 0 || i === filas.length - 1) && (
                    <text x={x} y={H - 10} textAnchor="middle" fontSize="10" fill="#94a3b8">{dia}</text>
                  )}
                  {f.vCant > 0 && (
                    <circle cx={x} cy={yFor(f.vMonto)} r={4.5} fill={VERDE} stroke="#fff" strokeWidth={1.5}>
                      <title>{`Día ${dia} · Ventas ${formatCLP(f.vMonto)} · ${f.vCant} factura${f.vCant === 1 ? "" : "s"}`}</title>
                    </circle>
                  )}
                  {f.cCant > 0 && (
                    <path
                      d={`M ${x} ${yFor(f.cMonto) - 5} L ${x + 5} ${yFor(f.cMonto)} L ${x} ${yFor(f.cMonto) + 5} L ${x - 5} ${yFor(f.cMonto)} Z`}
                      fill={ROJO}
                      stroke="#fff"
                      strokeWidth={1.5}
                    >
                      <title>{`Día ${dia} · Compras ${formatCLP(f.cMonto)} · ${f.cCant} factura${f.cCant === 1 ? "" : "s"}`}</title>
                    </path>
                  )}
                </g>
              );
            })}
          </svg>
          <p className="mt-1 text-xs text-slate-400">Monto facturado por día (notas de crédito restan). Pasa el mouse por cada punto.</p>
        </div>
      )}
    </Card>
  );
}

// ---------- Panel 2: ciclo de venta ----------
function Panel2({
  ciclo,
}: {
  ciclo: { fMonto: number; fCant: number; cMonto: number; cCant: number; pMonto: number; pCant: number };
}) {
  const max = Math.max(1, ciclo.fMonto, ciclo.cMonto, ciclo.pMonto);
  const barras = [
    { label: "Facturas de venta", monto: ciclo.fMonto, cant: ciclo.fCant, color: "#1d4ed8" },
    { label: "Ventas conciliadas", monto: ciclo.cMonto, cant: ciclo.cCant, color: VERDE },
    { label: "Notas de venta pagadas", monto: ciclo.pMonto, cant: ciclo.pCant, color: "#7c3aed" },
  ];
  return (
    <Card titulo="Ciclo de venta">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {barras.map((b) => (
          <Tile key={b.label} label={`${b.label} (${b.cant})`} value={formatCLP(b.monto)} color={b.color} />
        ))}
      </div>
      <div className="flex flex-col gap-3">
        {barras.map((b) => (
          <div key={b.label}>
            <div className="mb-1 flex justify-between text-xs text-slate-500">
              <span>{b.label}</span>
              <span>{b.cant} · {formatCLP(b.monto)}</span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full" style={{ width: `${Math.round((b.monto / max) * 100)}%`, backgroundColor: b.color }} />
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-400">Facturas de venta (33/34) → cuáles quedaron conciliadas con una nota → notas de venta ya pagadas.</p>
    </Card>
  );
}

// ---------- Panel 3: IVA mensual ----------
function Panel3({
  iva,
}: {
  iva: {
    filas: { clave: string; debito: number; credito: number; pagar: number }[];
    debitoT: number; creditoT: number; pagarT: number;
  };
}) {
  return (
    <Card titulo="IVA mensual (a pagar)">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Tile label="IVA ventas (débito)" value={formatCLP(iva.debitoT)} color={VERDE} />
        <Tile label="IVA compras (crédito)" value={formatCLP(iva.creditoT)} color={ROJO} />
        <Tile label="IVA a pagar" value={formatCLP(iva.pagarT)} color="#0f172a" destacado />
      </div>
      {iva.filas.length === 0 ? (
        <Vacio />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Mes</th>
                <th className="px-4 py-2 text-right">IVA débito</th>
                <th className="px-4 py-2 text-right">IVA crédito</th>
                <th className="px-4 py-2 text-right">A pagar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {iva.filas.map((f) => (
                <tr key={f.clave} className="text-slate-700">
                  <td className="px-4 py-2 font-medium text-slate-900">{etiquetaMes(f.clave)}</td>
                  <td className="px-4 py-2 text-right">{formatCLP(f.debito)}</td>
                  <td className="px-4 py-2 text-right">{formatCLP(f.credito)}</td>
                  <td className={`px-4 py-2 text-right font-semibold ${f.pagar < 0 ? "text-green-700" : "text-slate-900"}`}>
                    {formatCLP(f.pagar)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-slate-400">IVA a pagar = débito (ventas) − crédito (compras), por fecha de emisión. Notas de crédito restan. Negativo = remanente a favor.</p>
    </Card>
  );
}

// ---------- UI compartida ----------
function Card({ titulo, leyenda, children }: { titulo: string; leyenda?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-6 py-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{titulo}</h2>
        {leyenda && <div className="flex items-center gap-4 text-xs text-slate-600">{leyenda}</div>}
      </div>
      <div className="flex flex-col gap-5 p-6">{children}</div>
    </div>
  );
}

function Tile({ label, value, color, destacado }: { label: string; value: string; color: string; destacado?: boolean }) {
  return (
    <div className={`rounded-lg p-4 ${destacado ? "bg-slate-900" : "bg-slate-50"}`}>
      <div className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} />
        <p className={`text-xs font-medium ${destacado ? "text-slate-300" : "text-slate-500"}`}>{label}</p>
      </div>
      <p className={`mt-1 text-lg font-bold ${destacado ? "text-white" : "text-slate-900"}`}>{value}</p>
    </div>
  );
}

function Chip({ color, forma, children }: { color: string; forma: "circulo" | "rombo"; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <svg width="12" height="12" viewBox="0 0 12 12">
        {forma === "circulo" ? (
          <circle cx="6" cy="6" r="5" fill={color} />
        ) : (
          <path d="M6 1 L11 6 L6 11 L1 6 Z" fill={color} />
        )}
      </svg>
      {children}
    </span>
  );
}

function Vacio() {
  return <p className="py-4 text-center text-sm text-slate-500">Sin documentos en el período.</p>;
}
