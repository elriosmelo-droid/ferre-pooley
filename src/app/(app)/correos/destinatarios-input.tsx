"use client";

import { useId, useState } from "react";
import { parseDestinatarios } from "@/lib/email/destinatarios";
import { inputClass } from "@/components/form-ui";

export type Sugerencia = { correo: string; nombre: string };

// Campo de destinatarios con chips: se escribe, y con coma, Enter, espacio o al
// salir del campo el texto pasa a chip. Manda los correos separados por coma en
// un input oculto. Las sugerencias salen de los correos de clientes y
// proveedores.
export function DestinatariosInput({
  id,
  name,
  defaultValue = [],
  sugerencias = [],
  required = false,
}: {
  id: string;
  name: string;
  defaultValue?: string[];
  sugerencias?: Sugerencia[];
  required?: boolean;
}) {
  const [chips, setChips] = useState<string[]>(defaultValue);
  const [texto, setTexto] = useState("");
  const [invalidos, setInvalidos] = useState<string[]>([]);
  const listaId = useId();

  function confirmar(valor: string) {
    if (!valor.trim()) return;
    const { validos, invalidos: malos } = parseDestinatarios(valor);
    setChips((prev) => {
      const vistos = new Set(prev.map((c) => c.toLowerCase()));
      return [...prev, ...validos.filter((v) => !vistos.has(v.toLowerCase()))];
    });
    setInvalidos(malos);
    // Lo inválido se deja en el campo para corregirlo, no se pierde.
    setTexto(malos.join(" "));
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-slate-300 px-2 py-1.5 focus-within:border-brand-500 focus-within:ring-1 focus-within:ring-brand-500">
        {chips.map((c) => (
          <span
            key={c}
            className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-sm text-slate-800"
          >
            {c}
            <button
              type="button"
              aria-label={`Quitar ${c}`}
              onClick={() => setChips((prev) => prev.filter((x) => x !== c))}
              className="text-slate-400 hover:text-slate-700"
            >
              ×
            </button>
          </span>
        ))}
        <input
          id={id}
          type="text"
          inputMode="email"
          autoComplete="off"
          list={listaId}
          value={texto}
          required={required && chips.length === 0}
          onChange={(e) => {
            const v = e.target.value;
            // Coma o punto y coma cierran el chip. El espacio no: "Ana Pérez
            // <a@b.cl>" lleva espacios y se confirma al salir o con Enter.
            if (/[,;]$/.test(v)) confirmar(v);
            else setTexto(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              confirmar(texto);
            } else if (e.key === "Backspace" && texto === "" && chips.length) {
              setChips((prev) => prev.slice(0, -1));
            }
          }}
          onBlur={() => confirmar(texto)}
          placeholder={chips.length ? "" : "cliente@correo.cl"}
          className={`${inputClass} min-w-[12rem] flex-1 border-0 p-1 focus:ring-0`}
        />
      </div>
      <datalist id={listaId}>
        {sugerencias.map((s) => (
          <option key={s.correo} value={s.correo}>
            {s.nombre}
          </option>
        ))}
      </datalist>
      <input type="hidden" name={name} value={chips.join(",")} />
      {invalidos.length > 0 && (
        <p className="mt-1 text-xs text-red-600">
          Correo no válido: {invalidos.join(", ")}
        </p>
      )}
    </div>
  );
}
