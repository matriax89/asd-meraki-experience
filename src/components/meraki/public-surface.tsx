"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { isMerakiRoute, MerakiAppShell } from "./app-shell";

export function PublicSurface({ children, header, footer, popup, locale }: {
  children: ReactNode;
  header: ReactNode;
  footer: ReactNode;
  popup: ReactNode;
  locale: string;
}) {
  const pathname = usePathname();
  if (isMerakiRoute(pathname)) return <MerakiAppShell locale={locale}>{children}</MerakiAppShell>;
  return <>{header}{children}{footer}{popup}</>;
}
