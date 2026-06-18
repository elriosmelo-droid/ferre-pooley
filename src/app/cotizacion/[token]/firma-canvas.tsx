"use client";

import {
  forwardRef,
  useImperativeHandle,
  useEffect,
  useRef,
  useState,
} from "react";

export type FirmaCanvasHandle = {
  /** data URL PNG de la firma, o null si está vacía */
  obtenerFirma: () => string | null;
  limpiar: () => void;
  estaVacia: () => boolean;
};

// Canvas de firma manuscrita. Soporta mouse y touch. El trazo se dibuja en
// coordenadas de pantalla; el canvas se escala a la resolución del dispositivo
// para que la firma no salga pixelada.
export const FirmaCanvas = forwardRef<FirmaCanvasHandle>(function FirmaCanvas(
  _props,
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dibujando = useRef(false);
  const vacia = useRef(true);
  const [, forceRender] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1e293b";
  }, []);

  function posicion(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function inicio(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    dibujando.current = true;
    const { x, y } = posicion(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function mover(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!dibujando.current) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = posicion(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (vacia.current) {
      vacia.current = false;
      forceRender((n) => n + 1);
    }
  }

  function fin() {
    dibujando.current = false;
  }

  function limpiar() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    vacia.current = true;
    forceRender((n) => n + 1);
  }

  useImperativeHandle(ref, () => ({
    obtenerFirma: () =>
      vacia.current ? null : (canvasRef.current?.toDataURL("image/png") ?? null),
    limpiar,
    estaVacia: () => vacia.current,
  }));

  return (
    <div>
      <div className="relative">
        <canvas
          ref={canvasRef}
          onPointerDown={inicio}
          onPointerMove={mover}
          onPointerUp={fin}
          onPointerLeave={fin}
          className="h-40 w-full touch-none rounded-md border border-slate-300 bg-white"
        />
        {vacia.current && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-slate-400">
            Firme aquí con el dedo o el mouse
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={limpiar}
        className="mt-2 text-sm font-medium text-slate-500 hover:text-slate-700"
      >
        Limpiar firma
      </button>
    </div>
  );
});
