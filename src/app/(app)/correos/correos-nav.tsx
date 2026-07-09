import Link from "next/link";

const tabCls = (activo: boolean) =>
  `rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
    activo
      ? "bg-brand-600 text-white"
      : "text-slate-600 hover:bg-slate-100"
  }`;

export function CorreosNav({
  activo,
  sinLeer = 0,
}: {
  activo: "recibidos" | "enviados";
  sinLeer?: number;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Correos</h1>
        <div className="mt-3 inline-flex gap-1 rounded-xl border border-slate-200 bg-white p-1">
          <Link href="/correos" className={tabCls(activo === "recibidos")}>
            Recibidos
            {sinLeer > 0 && (
              <span
                className={`ml-2 rounded-full px-1.5 text-xs font-semibold ${
                  activo === "recibidos"
                    ? "bg-white/25 text-white"
                    : "bg-brand-600 text-white"
                }`}
              >
                {sinLeer}
              </span>
            )}
          </Link>
          <Link href="/correos/enviados" className={tabCls(activo === "enviados")}>
            Enviados
          </Link>
        </div>
      </div>
      <Link
        href="/correos/nuevo"
        className="inline-flex items-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
        Redactar
      </Link>
    </div>
  );
}
