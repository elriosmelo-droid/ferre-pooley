"use client";

import { useRef, useState, type ReactNode } from "react";

// Editor de texto enriquecido liviano (sin dependencias) sobre un div
// contentEditable. Sincroniza el HTML a un input oculto para enviarlo en el form.
export function RichEditor({
  name,
  defaultValue = "",
}: {
  name: string;
  defaultValue?: string;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [html, setHtml] = useState(defaultValue);

  function sync() {
    setHtml(editorRef.current?.innerHTML ?? "");
  }

  function exec(cmd: string, valor?: string) {
    document.execCommand(cmd, false, valor);
    editorRef.current?.focus();
    sync();
  }

  function ponerLink() {
    const url = window.prompt("URL del enlace:", "https://");
    if (url) exec("createLink", url);
  }

  return (
    <div className="rounded-md border border-slate-300 focus-within:border-brand-500 focus-within:ring-1 focus-within:ring-brand-500">
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 p-1.5">
        <Btn label="Negrita" onClick={() => exec("bold")}>
          <span className="font-bold">B</span>
        </Btn>
        <Btn label="Cursiva" onClick={() => exec("italic")}>
          <span className="italic">I</span>
        </Btn>
        <Btn label="Subrayado" onClick={() => exec("underline")}>
          <span className="underline">U</span>
        </Btn>
        <Sep />
        <Btn label="Lista con viñetas" onClick={() => exec("insertUnorderedList")}>
          •
        </Btn>
        <Btn label="Lista numerada" onClick={() => exec("insertOrderedList")}>
          1.
        </Btn>
        <Sep />
        <Btn label="Insertar enlace" onClick={ponerLink}>
          🔗
        </Btn>
        <Btn label="Quitar formato" onClick={() => exec("removeFormat")}>
          <span className="text-xs">✕</span>
        </Btn>
      </div>

      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={sync}
        dangerouslySetInnerHTML={{ __html: defaultValue }}
        className="prose-sm min-h-[220px] max-w-none px-3 py-2 text-sm text-slate-900 focus:outline-none"
      />

      <input type="hidden" name={name} value={html} />
    </div>
  );
}

function Btn({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded text-sm text-slate-600 transition-colors hover:bg-slate-100"
    >
      {children}
    </button>
  );
}

function Sep() {
  return <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden />;
}
