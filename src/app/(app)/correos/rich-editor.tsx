"use client";

import { useRef, useState, type ReactNode } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Color, FontSize, TextStyle } from "@tiptap/extension-text-style";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import Image from "@tiptap/extension-image";
import { MAX_IMAGEN_BYTES } from "@/lib/email/adjuntos";
import { subirArchivo } from "./subir-cliente";

const TAMANOS = [
  { valor: "", etiqueta: "Normal" },
  { valor: "12px", etiqueta: "Pequeño" },
  { valor: "18px", etiqueta: "Grande" },
  { valor: "24px", etiqueta: "Enorme" },
];

// Editor de texto enriquecido (TipTap). Entrega el HTML por un input oculto
// para enviarlo en el form. Se usa en el redactor y en la firma del perfil.
export function RichEditor({
  name,
  defaultValue = "",
  minHeight = 220,
  permitirImagenes = true,
}: {
  name: string;
  defaultValue?: string;
  minHeight?: number;
  permitirImagenes?: boolean;
}) {
  const [html, setHtml] = useState(defaultValue);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fotoRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<Editor | null>(null);

  async function insertarImagen(file: File) {
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("Solo se pueden insertar imágenes.");
      return;
    }
    if (file.size > MAX_IMAGEN_BYTES) {
      setError("La imagen supera los 8 MB.");
      return;
    }
    setSubiendo(true);
    try {
      const { urlPublica } = await subirArchivo("imagen", file);
      if (urlPublica) {
        editorRef.current
          ?.chain()
          .focus()
          .setImage({ src: urlPublica, alt: file.name, width: 480 })
          .run();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo subir la imagen.");
    } finally {
      setSubiendo(false);
    }
  }

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        link: { openOnClick: false, autolink: true },
      }),
      TextStyle,
      Color,
      FontSize,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ["paragraph", "heading"] }),
      Image.configure({ allowBase64: false }),
    ],
    content: defaultValue,
    // Next renderiza en el servidor primero: sin esto TipTap avisa de un
    // desajuste de hidratación.
    immediatelyRender: false,
    onCreate: ({ editor }) => {
      editorRef.current = editor;
      setHtml(editor.getHTML());
    },
    onUpdate: ({ editor }) => setHtml(editor.getHTML()),
    editorProps: {
      attributes: {
        class: "editor-correo focus:outline-none px-3 py-2 text-sm text-slate-900",
        style: `min-height:${minHeight}px`,
      },
      // Pegar o arrastrar una foto al cuerpo la sube a Storage.
      handlePaste: (_v, event) => {
        const f = Array.from(event.clipboardData?.files ?? []).find((x) =>
          x.type.startsWith("image/")
        );
        if (!f || !permitirImagenes) return false;
        void insertarImagen(f);
        return true;
      },
      handleDrop: (_v, event) => {
        const f = Array.from(event.dataTransfer?.files ?? []).find((x) =>
          x.type.startsWith("image/")
        );
        if (!f || !permitirImagenes) return false;
        event.preventDefault();
        void insertarImagen(f);
        return true;
      },
    },
  });

  return (
    <div className="rounded-md border border-slate-300 focus-within:border-brand-500 focus-within:ring-1 focus-within:ring-brand-500">
      {editor && (
        <Barra
          editor={editor}
          permitirImagenes={permitirImagenes}
          subiendo={subiendo}
          onFoto={() => fotoRef.current?.click()}
        />
      )}
      <EditorContent editor={editor} />
      <input
        ref={fotoRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void insertarImagen(f);
        }}
      />
      {error && <p className="border-t border-slate-200 px-3 py-1.5 text-xs text-red-600">{error}</p>}
      <input type="hidden" name={name} value={html} />
    </div>
  );
}

function Barra({
  editor,
  permitirImagenes,
  subiendo,
  onFoto,
}: {
  editor: Editor;
  permitirImagenes: boolean;
  subiendo: boolean;
  onFoto: () => void;
}) {
  const c = () => editor.chain().focus();

  function ponerLink() {
    const previo = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("URL del enlace (vacío para quitarlo):", previo ?? "https://");
    if (url === null) return;
    if (url.trim() === "") c().extendMarkRange("link").unsetLink().run();
    else c().extendMarkRange("link").setLink({ href: url.trim() }).run();
  }

  const tamanoActual =
    (editor.getAttributes("textStyle").fontSize as string | undefined) ?? "";

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 p-1.5">
      <Btn label="Deshacer" onClick={() => c().undo().run()} disabled={!editor.can().undo()}>↶</Btn>
      <Btn label="Rehacer" onClick={() => c().redo().run()} disabled={!editor.can().redo()}>↷</Btn>
      <Sep />
      <select
        aria-label="Tamaño del texto"
        value={tamanoActual}
        onChange={(e) =>
          e.target.value ? c().setFontSize(e.target.value).run() : c().unsetFontSize().run()
        }
        className="h-8 rounded border border-slate-200 bg-white px-1 text-xs text-slate-700"
      >
        {TAMANOS.map((t) => (
          <option key={t.valor} value={t.valor}>{t.etiqueta}</option>
        ))}
      </select>
      <Sep />
      <Btn label="Negrita" activo={editor.isActive("bold")} onClick={() => c().toggleBold().run()}>
        <span className="font-bold">B</span>
      </Btn>
      <Btn label="Cursiva" activo={editor.isActive("italic")} onClick={() => c().toggleItalic().run()}>
        <span className="italic">I</span>
      </Btn>
      <Btn label="Subrayado" activo={editor.isActive("underline")} onClick={() => c().toggleUnderline().run()}>
        <span className="underline">U</span>
      </Btn>
      <Btn label="Tachado" activo={editor.isActive("strike")} onClick={() => c().toggleStrike().run()}>
        <span className="line-through">S</span>
      </Btn>
      <Color_
        label="Color del texto"
        valor={(editor.getAttributes("textStyle").color as string | undefined) ?? "#000000"}
        onChange={(v) => c().setColor(v).run()}
      >
        <span className="font-bold">A</span>
      </Color_>
      <Color_
        label="Resaltado"
        valor="#ffff00"
        onChange={(v) => c().setHighlight({ color: v }).run()}
      >
        <span className="rounded bg-yellow-200 px-1 text-xs font-bold">ab</span>
      </Color_>
      <Sep />
      <Btn label="Alinear a la izquierda" activo={editor.isActive({ textAlign: "left" })} onClick={() => c().setTextAlign("left").run()}>⇤</Btn>
      <Btn label="Centrar" activo={editor.isActive({ textAlign: "center" })} onClick={() => c().setTextAlign("center").run()}>↔</Btn>
      <Btn label="Alinear a la derecha" activo={editor.isActive({ textAlign: "right" })} onClick={() => c().setTextAlign("right").run()}>⇥</Btn>
      <Btn label="Justificar" activo={editor.isActive({ textAlign: "justify" })} onClick={() => c().setTextAlign("justify").run()}>☰</Btn>
      <Sep />
      <Btn label="Lista con viñetas" activo={editor.isActive("bulletList")} onClick={() => c().toggleBulletList().run()}>•</Btn>
      <Btn label="Lista numerada" activo={editor.isActive("orderedList")} onClick={() => c().toggleOrderedList().run()}>1.</Btn>
      <Btn label="Aumentar sangría" onClick={() => c().sinkListItem("listItem").run()} disabled={!editor.can().sinkListItem("listItem")}>→</Btn>
      <Btn label="Reducir sangría" onClick={() => c().liftListItem("listItem").run()} disabled={!editor.can().liftListItem("listItem")}>←</Btn>
      <Btn label="Cita" activo={editor.isActive("blockquote")} onClick={() => c().toggleBlockquote().run()}>❝</Btn>
      <Btn label="Línea separadora" onClick={() => c().setHorizontalRule().run()}>―</Btn>
      <Sep />
      <Btn label="Enlace" activo={editor.isActive("link")} onClick={ponerLink}>🔗</Btn>
      {permitirImagenes && (
        <Btn label="Insertar imagen" onClick={onFoto} disabled={subiendo}>
          {subiendo ? "…" : "🖼"}
        </Btn>
      )}
      <Btn label="Quitar formato" onClick={() => c().unsetAllMarks().clearNodes().run()}>
        <span className="text-xs">✕</span>
      </Btn>
    </div>
  );
}

function Btn({
  label,
  onClick,
  children,
  activo = false,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  activo?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={activo}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`flex h-8 w-8 items-center justify-center rounded text-sm transition-colors disabled:opacity-30 ${
        activo ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100"
      }`}
    >
      {children}
    </button>
  );
}

// Selector de color con la forma de un botón de la barra.
function Color_({
  label,
  valor,
  onChange,
  children,
}: {
  label: string;
  valor: string;
  onChange: (v: string) => void;
  children: ReactNode;
}) {
  return (
    <label
      title={label}
      className="relative flex h-8 w-8 cursor-pointer items-center justify-center rounded text-sm text-slate-600 hover:bg-slate-100"
    >
      {children}
      <input
        type="color"
        aria-label={label}
        value={valor.startsWith("#") && valor.length === 7 ? valor : "#000000"}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </label>
  );
}

function Sep() {
  return <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden />;
}
