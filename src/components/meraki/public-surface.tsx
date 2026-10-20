"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { isMerakiRoute, MerakiAppShell } from "./app-shell";

export function PublicSurface({ children, header, footer, popup, locale, logoUrl, staffAccess = false }: {
  children: ReactNode;
  header: ReactNode;
  footer: ReactNode;
  popup: ReactNode;
  locale: string;
  logoUrl?: string;
  staffAccess?: boolean;
}) {
  const pathname = usePathname();
  if (isMerakiRoute(pathname)) return <MerakiAppShell locale={locale} logoUrl={logoUrl} staffAccess={staffAccess}>{children}</MerakiAppShell>;
  return <>{header}{children}{footer}{popup}</>;
}
