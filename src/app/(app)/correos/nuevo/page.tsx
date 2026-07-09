import Link from "next/link";
import { RedactarForm } from "../redactar-form";

export default async function RedactarCorreoPage({
  searchParams,
}: {
  searchParams: Promise<{ para?: string; asunto?: string; cuerpo?: string }>;
}) {
  const { para, asunto, cuerpo } = await searchParams;

  return (
    <div>
      <div className="mb-6">
        <Link href="/correos" className="text-sm text-slate-500 hover:text-slate-700">
          ← Correos
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">Redactar correo</h1>
      </div>
      <RedactarForm para={para} asunto={asunto} cuerpo={cuerpo} />
    </div>
  );
}
