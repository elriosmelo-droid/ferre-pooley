import { createClient } from "@/lib/supabase/server";
import { calcularMargen } from "@/lib/totals";
import { vencimientoEfectivo } from "@/lib/estado-cuenta";
import { esNotaCredito } from "@/lib/dte-doc";
import {
  fechaVentaNota,
  desglosarIva,
  type NotaCobrable,
} from "@/lib/cobros";
import {
  normalizarItemsPago,
  montoDeuda,
} from "@/lib/forma-pago-compra";
import { signoDte } from "@/lib/dte-doc";
import { FinanzasVista } from "./finanzas-vista";

type NotaQuery = {
  id: string;
  folio: string;
  total: number;
  subtotal_neto: number;
  estado: string;
  created_at: string;
  clientes: { nombre: string } | null;
  nota_venta_items: {
    cantidad: number;
    costo: number;
    precio: number;
    descuento: number;
  }[];
  pagos_nota_venta: {
    id: string;
    monto: number;
    fecha: string;
    medio_pago: string | null;
    observacion: string | null;
  }[];
};

type VentaQuery = {
  nota_venta_id: string | null;
  folio: string;
  tipo_doc: number;
  monto_total: number;
  fecha_emision: string | null;
  forma_pago: number | null;
  term_pago_dias: number | null;
  fecha_vencimiento_manual: string | null;
};

// Fecha de la venta en hora de Chile: created_at es timestamptz y el servidor
// corre en UTC, así que cortar el ISO directo corre el día durante la noche.
function fechaChile(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
  }).format(new Date(iso));
}

export default async function FinanzasPage() {
  const supabase = await createClient();

  const [{ data: notasData, error }, { data: ventasData }, { data: comprasData }] =
    await Promise.all([
    supabase
      .from("notas_venta")
      .select(
        `id, folio, total, subtotal_neto, estado, created_at, clientes(nombre),
         nota_venta_items(cantidad, costo, precio, descuento),
         pagos_nota_venta(id, monto, fecha, medio_pago, observacion)`
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("ventas_sii")
      .select(
        "nota_venta_id, folio, tipo_doc, monto_total, fecha_emision, forma_pago, term_pago_dias, fecha_vencimiento_manual"
      ),
    // Para las cuentas por pagar: la deuda con proveedores sale de la forma de
    // pago cargada a mano en cada compra, no del RCV.
    supabase
      .from("compras_sii")
      .select("tipo_doc, monto_total, monto_neto, formas_pago"),
  ]);

  const ventas = (ventasData ?? []) as VentaQuery[];

  // Facturas de cada nota, para fecharla por su emisión y no por el día en que
  // se digitó.
  const facturasPorNota = new Map<string, VentaQuery[]>();
  for (const v of ventas) {
    if (!v.nota_venta_id) continue;
    const lista = facturasPorNota.get(v.nota_venta_id) ?? [];
    lista.push(v);
    facturasPorNota.set(v.nota_venta_id, lista);
  }

  // Vencimiento de cada nota = el más temprano de sus facturas. Las notas de
  // crédito no vencen, así que no entran.
  const vencePorNota = new Map<string, string>();
  for (const v of ventas) {
    if (!v.nota_venta_id || esNotaCredito(v.tipo_doc)) continue;
    const venc = vencimientoEfectivo(
      v.fecha_vencimiento_manual,
      v.fecha_emision,
      v.forma_pago,
      v.term_pago_dias
    );
    if (!venc) continue;
    const actual = vencePorNota.get(v.nota_venta_id);
    if (!actual || venc < actual) vencePorNota.set(v.nota_venta_id, venc);
  }

  const notas: (NotaCobrable & {
    folio: string;
    cliente: string;
    // Neto del documento, para poder separar qué parte de un saldo es IVA.
    netoDoc: number;
    facturas: string[];
  })[] = (
    (notasData ?? []) as unknown as NotaQuery[]
  ).map((n) => {
    const { venta, margen } = calcularMargen(n.nota_venta_items ?? []);
    return {
      id: n.id,
      folio: n.folio,
      cliente: n.clientes?.nombre ?? "—",
      total: n.total,
      netoDoc: n.subtotal_neto ?? 0,
      // Folios de las facturas (33/34) de esta nota: es lo que el usuario
      // reconoce, la nota es un documento interno.
      facturas: (facturasPorNota.get(n.id) ?? [])
        .filter((v) => !esNotaCredito(v.tipo_doc))
        .map((v) => v.folio)
        .sort(),
      venta,
      margen,
      anulada: n.estado === "anulada",
      // La venta ocurrió cuando se emitió la factura, no cuando se cargó la
      // nota. Sin factura todavía, se cuenta el día que se cargó.
      fechaVenta: fechaVentaNota(
        facturasPorNota.get(n.id) ?? [],
        fechaChile(n.created_at)
      ),
      vencimiento: vencePorNota.get(n.id) ?? null,
      cobros: n.pagos_nota_venta ?? [],
    };
  });

  // Facturas del SII sin nota vinculada: no tienen costo conocido, así que
  // quedan fuera del cálculo. Se declara en pantalla en vez de esconderlo.
  const sueltas = ventas.filter(
    (v) => !v.nota_venta_id && !esNotaCredito(v.tipo_doc)
  );
  const sinNota = {
    cantidad: sueltas.length,
    monto: sueltas.reduce((s, v) => s + (v.monto_total ?? 0), 0),
  };

  // Cuentas por cobrar: saldo de todas las notas activas, no del período. Es
  // un saldo a hoy, no un flujo del mes.
  const porCobrar = desglosarIva(
    notas
      .filter((n) => !n.anulada)
      .map((n) => ({
        monto: n.total - n.cobros.reduce((s, c) => s + c.monto, 0),
        netoDoc: n.netoDoc,
        totalDoc: n.total,
      }))
      .filter((x) => x.monto > 0)
  );

  // Cuentas por pagar: lo asignado a cheque y crédito en cada compra. Las
  // notas de crédito del proveedor restan.
  const compras = (comprasData ?? []) as {
    tipo_doc: number;
    monto_total: number;
    monto_neto: number;
    formas_pago: unknown;
  }[];
  const conFormas = compras.filter(
    (c) => normalizarItemsPago(c.formas_pago).length > 0
  );
  const porPagar = desglosarIva(
    conFormas.map((c) => ({
      monto:
        signoDte(c.tipo_doc) *
        (montoDeuda(normalizarItemsPago(c.formas_pago), c.monto_total) ?? 0),
      netoDoc: c.monto_neto ?? 0,
      totalDoc: c.monto_total ?? 0,
    }))
  );
  // Las compras sin forma de pago cargada no se sabe si se deben: no suman, y
  // se declaran para que el número no se lea como completo.
  const comprasSinCargar = compras.filter(
    (c) => normalizarItemsPago(c.formas_pago).length === 0
  );
  const pagarPendiente = {
    cantidad: comprasSinCargar.length,
    monto: comprasSinCargar.reduce(
      (s, c) => s + signoDte(c.tipo_doc) * (c.monto_total ?? 0),
      0
    ),
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Finanzas</h1>
        <p className="mt-1 text-sm text-slate-500">
          La ruta del dinero: cuánto de lo vendido y de la utilidad entró
          efectivamente a caja.
        </p>
      </div>

      {error ? (
        <p className="text-sm text-red-600">
          No se pudieron cargar los datos. Intenta nuevamente.
        </p>
      ) : (
        <FinanzasVista
          notas={notas}
          sinNota={sinNota}
          porCobrar={porCobrar}
          porPagar={porPagar}
          pagarPendiente={pagarPendiente}
        />
      )}
    </div>
  );
}
