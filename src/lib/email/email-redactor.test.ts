import { describe, expect, it } from "vitest";
import { sanearHtml, htmlATexto } from "./sanear-html";
import { parseDestinatarios } from "./destinatarios";
import {
  validarAdjuntos,
  nombreSeguro,
  MAX_ADJUNTOS_BYTES,
} from "./adjuntos";
import {
  firmaPorDefecto,
  cuerpoInicial,
  prefijoAsunto,
  citarOriginal,
  destinatariosResponderATodos,
} from "./firma";

describe("sanearHtml", () => {
  it("quita scripts, eventos y javascript:", () => {
    const sucio =
      '<p onclick="x()">hola</p><script>alert(1)</script><a href="javascript:alert(1)">l</a><img src="javascript:alert(1)" onerror="x()">';
    const limpio = sanearHtml(sucio);
    expect(limpio).not.toMatch(/script|onclick|onerror|javascript:/i);
    expect(limpio).toContain("hola");
  });
  it("conserva el formato que produce el editor", () => {
    const html =
      '<p style="text-align: center"><strong>Hola</strong> <span style="color: #ff0000">rojo</span></p><ul><li>uno</li></ul><img src="https://x.cl/a.png" alt="a" width="180">';
    const limpio = sanearHtml(html);
    expect(limpio).toContain("<strong>Hola</strong>");
    expect(limpio).toContain("color:#ff0000");
    expect(limpio).toContain("text-align:center");
    expect(limpio).toContain("<li>uno</li>");
    expect(limpio).toContain('src="https://x.cl/a.png"');
  });
  it("rechaza imágenes data: y estilos fuera de la lista", () => {
    const limpio = sanearHtml(
      '<img src="data:image/png;base64,AAAA"><p style="position:fixed;color:red">x</p>'
    );
    expect(limpio).not.toContain("data:");
    expect(limpio).not.toContain("position");
    expect(limpio).toContain("color:red");
  });
  it("los enlaces abren en pestaña nueva con noopener", () => {
    expect(sanearHtml('<a href="https://x.cl">x</a>')).toContain(
      'rel="noopener noreferrer"'
    );
  });
});

describe("htmlATexto", () => {
  it("convierte bloques en saltos de línea", () => {
    expect(htmlATexto("<p>uno</p><p>dos &amp; tres</p>")).toBe("uno\ndos & tres");
  });
});

describe("parseDestinatarios", () => {
  it("separa por coma, punto y coma, espacios y saltos", () => {
    const r = parseDestinatarios("a@x.cl, b@x.cl; c@x.cl\nd@x.cl e@x.cl");
    expect(r.validos).toEqual(["a@x.cl", "b@x.cl", "c@x.cl", "d@x.cl", "e@x.cl"]);
    expect(r.invalidos).toEqual([]);
  });
  it("acepta 'Nombre <correo>' y quita repetidos sin mirar mayúsculas", () => {
    const r = parseDestinatarios("Ana Pérez <ana@x.cl>, ANA@x.cl");
    expect(r.validos).toEqual(["ana@x.cl"]);
  });
  it("separa los inválidos", () => {
    const r = parseDestinatarios("bien@x.cl, mal, otro@");
    expect(r.validos).toEqual(["bien@x.cl"]);
    expect(r.invalidos).toEqual(["mal", "otro@"]);
  });
  it("vacío no da nada", () => {
    expect(parseDestinatarios("  ")).toEqual({ validos: [], invalidos: [] });
  });
});

describe("adjuntos", () => {
  it("acepta hasta el límite y rechaza pasarse", () => {
    expect(validarAdjuntos([{ filename: "a", size: MAX_ADJUNTOS_BYTES }])).toBeNull();
    expect(
      validarAdjuntos([
        { filename: "a", size: MAX_ADJUNTOS_BYTES },
        { filename: "b", size: 1 },
      ])
    ).toMatch(/25 MB/);
  });
  it("rechaza archivos vacíos y demasiados archivos", () => {
    expect(validarAdjuntos([{ filename: "a", size: 0 }])).toMatch(/vacío/);
    const muchos = Array.from({ length: 16 }, (_, i) => ({ filename: `${i}`, size: 1 }));
    expect(validarAdjuntos(muchos)).toMatch(/Máximo/);
  });
  it("nombreSeguro quita tildes, carpetas y conserva la extensión", () => {
    expect(nombreSeguro("../Cotización final (1).pdf")).toBe("Cotizacion_final_1_.pdf");
    expect(nombreSeguro("???")).toBe("archivo");
    expect(nombreSeguro("")).toBe("archivo");
  });
});

describe("firma y respuestas", () => {
  it("firma por defecto escapa HTML y trae el logo", () => {
    const f = firmaPorDefecto({
      nombre: "Víctor <b>",
      razonSocial: "Tulbless SpA",
      logoUrl: "https://www.tulbless.cl/logo-full.png",
    });
    expect(f).toContain("Víctor &lt;b&gt;");
    expect(f).toContain('src="https://www.tulbless.cl/logo-full.png"');
  });
  it("firma sin datos igual lleva el logo", () => {
    expect(firmaPorDefecto({ logoUrl: "https://x/l.png" })).toContain("<img");
  });
  it("cuerpoInicial pone la firma antes de la cita", () => {
    const c = cuerpoInicial("<p>FIRMA</p>", "<blockquote>CITA</blockquote>");
    expect(c.indexOf("FIRMA")).toBeLessThan(c.indexOf("CITA"));
  });
  it("cuerpoInicial sin firma deja un párrafo vacío", () => {
    expect(cuerpoInicial("")).toBe("<p></p>");
  });
  it("prefijoAsunto no duplica Re: ni Fwd:", () => {
    expect(prefijoAsunto("Hola", "Re:")).toBe("Re: Hola");
    expect(prefijoAsunto("RE: Hola", "Re:")).toBe("RE: Hola");
    expect(prefijoAsunto("Hola", "Fwd:")).toBe("Fwd: Hola");
    expect(prefijoAsunto(null, "Re:")).toBe("Re:");
  });
  it("citarOriginal escapa el texto plano y marca el reenvío", () => {
    const q = citarOriginal({ de: "a@x.cl", fecha: "hoy", html: null, texto: "<hola>" });
    expect(q).toContain("&lt;hola&gt;");
    const r = citarOriginal({ de: "a@x.cl", fecha: "hoy", html: "<p>x</p>", texto: null, reenvio: true, asunto: "As", para: ["b@x.cl"] });
    expect(r).toContain("Mensaje reenviado");
    expect(r).toContain("b@x.cl");
  });
  it("responder a todos: remitente en Para, resto en CC sin mis casillas", () => {
    const r = destinatariosResponderATodos({
      de: "Cliente <cli@x.cl>",
      para: ["ventas@tulbless.cl", "otro@x.cl"],
      cc: ["Cli@x.cl", "copia@x.cl"],
      propios: ["ventas@tulbless.cl"],
    });
    expect(r.para).toEqual(["cli@x.cl"]);
    expect(r.cc).toEqual(["otro@x.cl", "copia@x.cl"]);
  });
});
