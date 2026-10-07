"use client";

import { useRef, useState } from "react";
import {
  tamanoLegible,
  validarAdjuntos,
  type AdjuntoSubido,
} from "@/lib/email/adjuntos";
import { subirArchivo } from "./subir-cliente";

type Item = {
  key: string;
  file: File;
  estado: "subiendo" | "ok" | "error";
  adjunto?: AdjuntoSubido;
  error?: string;
};

// Adjuntos al estilo Gmail: botón o arrastrar y soltar. Cada archivo sube
// directo a Storage y queda como chip con su tamaño. Manda la lista de los ya
// subidos como JSON en un input oculto y avisa al padre si queda alguno
// subiendo, para bloquear el envío.
export function AdjuntosUploader({
  name,
  onOcupado,
}: {
  name: string;
  onOcupado: (ocupado: boolean) => void;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [arrastrando, setArrastrando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function actualizar(next: Item[]) {
    setItems(next);
    onOcupado(next.some((i) => i.estado === "subiendo"));
  }

  async function agregar(files: FileList | File[]) {
    setAviso(null);
    const nuevos = Array.from(files);
    const vigentes = items.filter((i) => i.estado !== "error");
    const err = validarAdjuntos([
      ...vigentes.map((i) => ({ filename: i.file.name, size: i.file.size })),
      ...nuevos.map((f) => ({ filename: f.name, size: f.size })),
    ]);
    if (err) {
      setAviso(err);
      return;
    }
    const alta: Item[] = nuevos.map((file) => ({
      key: `${file.name}-${file.size}-${crypto.randomUUID()}`,
      file,
      estado: "subiendo",
    }));
    actualizar([...items, ...alta]);

    await Promise.all(
      alta.map(async (it) => {
        let resultado: Partial<Item>;
        try {
          const { ruta } = await subirArchivo("adjunto", it.file);
          resultado = {
            estado: "ok",
            adjunto: {
              id: crypto.randomUUID(),
              filename: it.file.name,
              size: it.file.size,
              content_type: it.file.type || "application/octet-stream",
              ruta,
            },
          };
        } catch (e) {
          resultado = {
            estado: "error",
            error: e instanceof Error ? e.message : "No se pudo subir",
          };
        }
        // Se parte del estado más reciente: varias subidas terminan a la vez.
        setItems((prev) => {
          const next = prev.map((p) => (p.key === it.key ? { ...p, ...resultado } : p));
          onOcupado(next.some((i) => i.estado === "subiendo"));
          return next;
        });
      })
    );
  }

  function quitar(key: string) {
    actualizar(items.filter((i) => i.key !== key));
  }

  const subidos = items
    .filter((i) => i.estado === "ok" && i.adjunto)
    .map((i) => i.adjunto as AdjuntoSubido);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setArrastrando(true);
      }}
      onDragLeave={() => setArrastrando(false)}
      onDrop={(e) => {
        e.preventDefault();
        setArrastrando(false);
        if (e.dataTransfer.files.length) void agregar(e.dataTransfer.files);
      }}
      className={`rounded-md border border-dashed p-3 transition-colors ${
        arrastrando ? "border-brand-500 bg-brand-50" : "border-slate-300"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          📎 Adjuntar archivos
        </button>
        <span className="text-xs text-slate-500">
          o arrástralos aquí · máx. 25 MB en total
        </span>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) void agregar(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {items.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {items.map((i) => (
            <li
              key={i.key}
              className={`inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs ${
                i.estado === "error"
                  ? "border-red-200 bg-red-50 text-red-700"
                  : "border-slate-200 bg-slate-50 text-slate-700"
              }`}
              title={i.error}
            >
              <span>📎 {i.file.name}</span>
              <span className="text-slate-400">
                {i.estado === "subiendo"
                  ? "subiendo…"
                  : i.estado === "error"
                    ? (i.error ?? "error")
                    : tamanoLegible(i.file.size)}
              </span>
              <button
                type="button"
                aria-label={`Quitar ${i.file.name}`}
                onClick={() => quitar(i.key)}
                className="text-slate-400 hover:text-slate-700"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {aviso && <p className="mt-2 text-xs text-red-600">{aviso}</p>}
      <input type="hidden" name={name} value={JSON.stringify(subidos)} />
    </div>
  );
}
