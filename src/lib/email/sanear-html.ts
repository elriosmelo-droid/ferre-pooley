import sanitizeHtml from "sanitize-html";

// Lista blanca de lo que el editor puede producir. Todo HTML que sale por
// correo, se guarda o se muestra pasa por acá: el cuerpo viene de un editor en
// el navegador, así que el servidor no debe confiar en él.
const COLOR = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|[a-z]+)$/i;
const TAMANO = /^\d+(\.\d+)?(px|pt|em|rem|%)$/;

export function sanearHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      "p", "br", "div", "span", "strong", "b", "em", "i", "u", "s", "strike",
      "mark", "h1", "h2", "h3", "ul", "ol", "li", "blockquote", "hr", "a",
      "img", "table", "tbody", "thead", "tr", "td", "th", "sub", "sup",
    ],
    allowedAttributes: {
      a: ["href", "target", "rel", "title"],
      img: ["src", "alt", "width", "height", "title"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan"],
      "*": ["style", "data-color"],
    },
    allowedStyles: {
      "*": {
        color: [COLOR],
        "background-color": [COLOR],
        "text-align": [/^(left|right|center|justify)$/],
        "font-size": [TAMANO],
      },
      img: {
        width: [TAMANO],
        height: [TAMANO],
        "max-width": [TAMANO],
      },
    },
    // Nada de data: ni javascript: en enlaces; las imágenes solo por http(s)
    // (las fotos van a Storage y se insertan por URL).
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: { img: ["http", "https"] },
    allowProtocolRelative: false,
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: { ...attribs, target: "_blank", rel: "noopener noreferrer" },
      }),
    },
  });
}

// Versión en texto plano (respaldo del correo y vista de lista).
export function htmlATexto(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|blockquote|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
