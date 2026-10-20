import { defineRouting } from "next-intl/routing";
import { createNavigation } from "next-intl/navigation";

export const routing = defineRouting({
  locales: ["it", "en", "de", "es"],
  defaultLocale: "it",
  localeDetection: true,
  localeCookie: { maxAge: 60 * 60 * 24 * 365, sameSite: "lax" },
});

export const { Link, usePathname, useRouter } =
  createNavigation(routing);
