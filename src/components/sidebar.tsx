"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/login/actions";

const menuItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/cotizaciones", label: "Cotizaciones" },
  { href: "/notas-venta", label: "Notas de Venta" },
  { href: "/ventas", label: "Ventas" },
  { href: "/conciliacion", label: "Conciliación" },
  { href: "/compras", label: "Compras" },
  { href: "/proveedores", label: "Proveedores" },
  { href: "/productos", label: "Productos" },
  { href: "/clientes", label: "Clientes" },
];

function linkClasses(active: boolean) {
  return `block rounded-md px-3 py-3 text-sm font-medium transition-colors ${
    active
      ? "bg-brand-600 text-white"
      : "text-slate-300 hover:bg-slate-800 hover:text-white"
  }`;
}

export function Sidebar() {
  const pathname = usePathname();
  const [abierto, setAbierto] = useState(false);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  const cerrar = () => setAbierto(false);

  const contenido = (
    <>
      <div className="flex justify-center border-b border-slate-800 px-4 py-6">
        <Link href="/dashboard" onClick={cerrar}>
          <Image
            src="/logo-marca.png"
            alt="Tulbless"
            width={310}
            height={229}
            priority
            className="h-auto w-[150px]"
          />
        </Link>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-2">
        {menuItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={cerrar}
            className={linkClasses(isActive(item.href))}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="space-y-1 border-t border-slate-800 px-3 py-4">
        <Link
          href="/perfil"
          onClick={cerrar}
          className={linkClasses(isActive("/perfil"))}
        >
          Mi Perfil
        </Link>
        <form action={logout}>
          <button
            type="submit"
            className="block w-full rounded-md px-3 py-3 text-left text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
          >
            Cerrar sesión
          </button>
        </form>
      </div>
    </>
  );

  return (
    <>
      {/* Barra superior solo en móvil */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <Link href="/dashboard">
          <Image
            src="/logo-marca.png"
            alt="Tulbless"
            width={310}
            height={229}
            priority
            className="h-auto w-[110px]"
          />
        </Link>
        <button
          type="button"
          onClick={() => setAbierto(true)}
          aria-label="Abrir menú"
          className="rounded-md p-2 text-slate-700 hover:bg-slate-100"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
      </header>

      {/* Sidebar fijo en desktop */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[220px] flex-col bg-slate-900 lg:flex">
        {contenido}
      </aside>

      {/* Drawer móvil */}
      {abierto && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={cerrar}
            aria-hidden
          />
          <aside className="absolute inset-y-0 left-0 flex w-[260px] max-w-[80vw] flex-col bg-slate-900">
            <button
              type="button"
              onClick={cerrar}
              aria-label="Cerrar menú"
              className="absolute right-3 top-3 z-10 rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
            {contenido}
          </aside>
        </div>
      )}
    </>
  );
}
