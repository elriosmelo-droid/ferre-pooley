"use client";

import { useOptimistic, useRef, useState, useTransition } from "react";
import { estadoItem, resumenEntrega } from "@/lib/entregas";
import { registrarEntrega } from "../actions";

// Entrega de un ítem: el check entrega todo (o lo desmarca) y «Parcial»
// permite indicar cuánto se entregó. Optimista: cambia al instante y vuelve
// atrás si el servidor rechaza.
export function EntregaItem({
  notaVentaId,
  itemId,
  cantidad,
  cantidadEntregada,
  entregadoAt,
  soloLectura,
}: {
  notaVentaId: string;
  itemId: string;
  cantidad: number;
  cantidadEntregada: number;
  entregadoAt: string | null;
  soloLectura: boolean;
}) {
  const [optimista, setOptimista] = useOptimistic(cantidadEntregada);
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const estado = estadoItem({ cantidad, cantidad_entregada: optimista });
  const fecha = entregadoAt
    ? new Date(entregadoAt).toLocaleDateString("es-CL", { timeZone: "America/Santiago" })
    : null;
  const titulo =
    estado === "entregado"
      ? `Entregado${fecha ? ` el ${fecha}` : ""}`
      : estado === "parcial"
        ? `Entregado ${optimista} de ${cantidad}${fecha ? ` (último cambio ${fecha})` : ""}`
        : "Sin entregar";

  function guardar(nuevo: number) {
    setError(null);
    startTransition(async () => {
      setOptimista(nuevo);
      const r = await registrarEntrega(notaVentaId, [{ id: itemId, cantidad_entregada: nuevo }]);
      if (r.error) setError(r.error);
    });
  }

  function abrirParcial() {
    setValor(optimista > 0 && optimista < cantidad ? String(optimista) : "");
    setError(null);
    setEditando(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function guardarParcial(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(valor);
    if (!Number.isInteger(n) || n < 0 || n > cantidad) {
      setError(`Ingresa un número entre 0 y ${cantidad}`);
      return;
    }
    setEditando(false);
    guardar(n);
  }

  return (
    <div className="flex flex-col items-center gap-1" title={titulo}>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={estado === "entregado"}
          ref={(el) => {
            if (el) el.indeterminate = estado === "parcial";
          }}
          disabled={soloLectura || pending}
          onChange={() => guardar(estado === "entregado" ? 0 : cantidad)}
          aria-label={titulo}
          className="h-5 w-5 cursor-pointer rounded border-slate-300 text-green-600 focus:ring-green-500 disabled:cursor-default"
        />
        {!soloLectura && !editando && cantidad > 1 && (
          <button
            type="button"
            onClick={abrirParcial}
            className="text-xs font-medium text-brand-600 hover:text-brand-800"
          >
            Parcial
          </button>
        )}
      </div>

      {estado === "parcial" && !editando && (
        <span className="whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
          {optimista} de {cantidad}
        </span>
      )}

      {editando && (
        <form onSubmit={guardarParcial} className="flex items-center gap-1">
          <input
            ref={inputRef}
            type="number"
            min={0}
            max={cantidad}
            step={1}
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setEditando(false)}
            aria-label={`Cantidad entregada de ${cantidad}`}
            className="w-16 rounded border border-slate-300 px-1.5 py-0.5 text-right text-xs focus:border-brand-500 focus:outline-none"
          />
          <span className="whitespace-nowrap text-xs text-slate-500">de {cantidad}</span>
          <button type="submit" className="text-xs font-semibold text-brand-600 hover:text-brand-800">
            OK
          </button>
          <button
            type="button"
            onClick={() => setEditando(false)}
            className="text-xs text-slate-500 hover:text-slate-700"
            aria-label="Cancelar"
          >
            ✕
          </button>
        </form>
      )}

      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}

const BADGE = {
  entregada: { cls: "bg-green-100 text-green-800", texto: () => "Todo entregado" },
  parcial: {
    cls: "bg-amber-100 text-amber-800",
    texto: (r: ReturnType<typeof resumenEntrega>) =>
      `Entrega parcial: ${r.entregados} de ${r.items} ítem${r.items === 1 ? "" : "s"} completo${r.items === 1 ? "" : "s"}`,
  },
  pendiente: { cls: "bg-slate-100 text-slate-700", texto: () => "Sin entregar" },
} as const;

// Resumen y acción masiva sobre todos los ítems de la nota.
export function EntregaResumen({
  notaVentaId,
  items,
  soloLectura,
}: {
  notaVentaId: string;
  items: { id: string; cantidad: number; cantidad_entregada: number }[];
  soloLectura: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const r = resumenEntrega(items);
  if (r.estado === "sin_items") return null;
  const completa = r.estado === "entregada";

  function marcarTodo() {
    setError(null);
    const entregas = items
      .filter((i) => completa || i.cantidad_entregada < i.cantidad)
      .map((i) => ({ id: i.id, cantidad_entregada: completa ? 0 : Math.max(i.cantidad, 0) }));
    startTransition(async () => {
      const res = await registrarEntrega(notaVentaId, entregas);
      if (res.error) setError(res.error);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <span className={`rounded-full px-3 py-1 font-medium ${BADGE[r.estado].cls}`}>
        {BADGE[r.estado].texto(r)}
      </span>
      {!soloLectura && (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (completa && !confirm("¿Desmarcar la entrega de todos los ítems?")) return;
            marcarTodo();
          }}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
        >
          {pending ? "Guardando…" : completa ? "Desmarcar todo" : "Marcar todo entregado"}
        </button>
      )}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
