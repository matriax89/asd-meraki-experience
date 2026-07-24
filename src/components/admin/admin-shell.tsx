"use client";

import { useState } from "react";
import {
  Activity,
  CalendarDays,
  ChevronRight,
  Dumbbell,
  Handshake,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  PanelLeftClose,
  Search,
  Settings,
  ShoppingBag,
  Sparkles,
  Tag,
  Ticket,
  Users,
  X,
} from "lucide-react";
import { Link, usePathname } from "@/i18n/routing";
import type { LucideIcon } from "lucide-react";
import { Badge, IconButton, TextField } from "@radix-ui/themes";

type AdminShellProps = {
  children: React.ReactNode;
  identity: {
    email: string;
    fullName: string | null;
    role: "admin" | "editor";
  };
};

type NavItem = {
  name: string;
  href: string;
  icon: LucideIcon;
};

const sections: { label: string; items: NavItem[] }[] = [
  {
    label: "Workspace",
    items: [
      { name: "Panoramica", href: "/admin", icon: LayoutDashboard },
      { name: "Lead e richieste", href: "/admin/leads", icon: Users },
      { name: "Ordini", href: "/admin/ordini", icon: ShoppingBag },
      { name: "Biglietti", href: "/admin/biglietti", icon: Ticket },
    ],
  },
  {
    label: "Contenuti",
    items: [
      { name: "Prodotti", href: "/admin/prodotti", icon: Package },
      { name: "Corsi", href: "/admin/corsi", icon: Dumbbell },
      { name: "Eventi", href: "/admin/eventi", icon: CalendarDays },
      { name: "Partner", href: "/admin/sponsors", icon: Handshake },
    ],
  },
  {
    label: "Crescita",
    items: [
      { name: "Coupon", href: "/admin/coupon", icon: Tag },
      { name: "Prova gratuita", href: "/admin/prova-gratuita", icon: Sparkles },
      { name: "Impostazioni sito", href: "/admin/impostazioni", icon: Settings },
    ],
  },
];

function isActive(pathname: string, href: string) {
  return href === "/admin"
    ? pathname.endsWith("/admin")
    : pathname.includes(href);
}

export function AdminShell({ children, identity }: AdminShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [compact, setCompact] = useState(false);

  const allItems: NavItem[] = sections.flatMap((section) => section.items);
  const currentItem = allItems
    .find((item) => isActive(pathname, item.href));
  const initials = (identity.fullName || identity.email || "ME")
    .split(/\s|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  const navigation = (
    <>
      <div className="flex h-14 items-center justify-between border-b border-slate-200 px-3">
        <Link href="/admin" className="flex min-w-0 items-center gap-3">
          <span className="grid size-7 shrink-0 place-items-center rounded-[5px] bg-slate-950 text-[11px] font-bold text-white">
            M
          </span>
          {!compact && (
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-semibold text-slate-950">
                Meraki
              </span>
              <span className="block text-[10px] text-slate-500">
                Amministrazione
              </span>
            </span>
          )}
        </Link>
        <IconButton
          type="button"
          variant="ghost"
          color="gray"
          size="1"
          onClick={() => setCompact((value) => !value)}
          className="!hidden lg:!inline-flex"
          aria-label={compact ? "Espandi navigazione" : "Comprimi navigazione"}
        >
          <PanelLeftClose className={`size-4 transition ${compact ? "rotate-180" : ""}`} />
        </IconButton>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {sections.map((section) => (
          <div key={section.label} className="mb-6">
            {!compact && (
              <p className="mb-1.5 px-2 text-[10px] font-medium text-slate-500">
                {section.label}
              </p>
            )}
            <div className="space-y-1">
              {section.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    title={compact ? item.name : undefined}
                    className={`group flex h-8 items-center rounded-[5px] transition ${
                      compact ? "justify-center px-0" : "gap-2 px-2"
                    } ${
                      active
                        ? "bg-slate-100 text-slate-950"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                    }`}
                  >
                    <Icon className="size-[15px] shrink-0" strokeWidth={active ? 2.1 : 1.7} />
                    {!compact && (
                      <>
                        <span className="flex-1 text-[12px] font-medium">{item.name}</span>
                        {active && <ChevronRight className="size-3.5 opacity-50" />}
                      </>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-slate-200 p-2">
        <div className={`flex items-center ${compact ? "justify-center" : "gap-2"} rounded-[6px] p-1.5`}>
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-700">
            {initials}
          </span>
          {!compact && (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[11px] font-medium text-slate-950">
                  {identity.fullName || "Team Meraki"}
                </span>
                <span className="block truncate text-[10px] text-slate-500">
                  {identity.role === "admin" ? "Amministratore" : "Editor"}
                </span>
              </span>
              <form action="/auth/signout" method="post">
                <button
                  type="submit"
                  className="grid size-7 place-items-center rounded-[5px] text-slate-500 transition hover:bg-red-50 hover:text-red-600"
                  aria-label="Disconnetti"
                >
                  <LogOut className="size-4" />
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </>
  );

  return (
    <div className="admin-surface min-h-dvh bg-slate-50 text-slate-950">
      <aside
        className={`fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-slate-200 bg-white transition-[width] duration-200 lg:flex ${
          compact ? "w-[56px]" : "w-[224px]"
        }`}
      >
        {navigation}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            aria-label="Chiudi navigazione"
          />
          <aside className="relative flex h-full w-[260px] flex-col border-r border-slate-200 bg-white shadow-lg">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute right-2 top-2 z-10 grid size-8 place-items-center rounded-[5px] text-slate-500 hover:bg-slate-50 hover:text-slate-950"
              aria-label="Chiudi navigazione"
            >
              <X className="size-5" />
            </button>
            {navigation}
          </aside>
        </div>
      )}

      <div className={`transition-[padding] duration-200 ${compact ? "lg:pl-[56px]" : "lg:pl-[224px]"}`}>
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="flex h-12 items-center gap-3 px-4 lg:px-6">
            <IconButton
              type="button"
              variant="soft"
              color="gray"
              size="2"
              onClick={() => setMobileOpen(true)}
              className="lg:!hidden"
              aria-label="Apri navigazione"
            >
              <Menu className="size-5" />
            </IconButton>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-[13px] font-semibold">
                {currentItem?.name || "Pannello di controllo"}
              </h1>
            </div>
            <TextField.Root size="1" placeholder="Cerca…" className="hidden w-48 sm:flex">
              <TextField.Slot>
                <Search className="size-3.5" />
              </TextField.Slot>
            </TextField.Root>
            <Badge color="green" variant="soft" radius="full" size="1">
              <Activity className="size-3" />
              Online
            </Badge>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1440px] px-4 py-5 lg:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}
