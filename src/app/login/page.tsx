import Image from "next/image";
import { login } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 to-brand-50 px-4">
      <div className="w-full max-w-sm rounded-xl border-t-4 border-brand-600 bg-white p-8 shadow-lg">
        <div className="mb-8 flex justify-center">
          <Image
            src="/logo-full.png"
            alt="Tulbless"
            width={459}
            height={263}
            priority
            className="h-auto w-[210px]"
          />
        </div>
        <form action={login} className="flex flex-col gap-4">
          <div>
            <label
              htmlFor="email"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Correo electrónico
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Contraseña
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          {error && (
            <p className="text-sm text-red-600">Credenciales inválidas</p>
          )}
          <button
            type="submit"
            className="mt-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
          >
            Ingresar
          </button>
        </form>
      </div>
    </main>
  );
}
