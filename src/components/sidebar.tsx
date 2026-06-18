"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/login/actions";

const menuItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/cotizaciones", label: "Cotizaciones" },
  { href: "/notas-venta", label: "Notas de Venta" },
  { href: "/productos", label: "Productos" },
  { href: "/clientes", label: "Clientes" },
];

function linkClasses(active: boolean) {
  return `block rounded-md px-3 py-2 text-sm font-medium transition-colors ${
    active
      ? "bg-slate-700 text-white"
      : "text-slate-300 hover:bg-slate-800 hover:text-white"
  }`;
}

export function Sidebar() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <aside className="fixed inset-y-0 left-0 flex w-[220px] flex-col bg-slate-900">
      <div className="px-4 py-5">
        <Link href="/dashboard" className="text-lg font-bold text-white">
          🔩 Tulbless
        </Link>
      </div>
      <nav className="flex-1 space-y-1 px-3">
        {menuItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={linkClasses(isActive(item.href))}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="space-y-1 border-t border-slate-800 px-3 py-4">
        <Link href="/perfil" className={linkClasses(isActive("/perfil"))}>
          Mi Perfil
        </Link>
        <form action={logout}>
          <button
            type="submit"
            className="block w-full rounded-md px-3 py-2 text-left text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
          >
            Cerrar sesión
          </button>
        </form>
      </div>
    </aside>
  );
}
