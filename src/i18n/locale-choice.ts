export const SUPPORTED_LOCALES = ["it", "en", "de", "es"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const LOCALE_CHOICE_COOKIE = "MERAKI_LOCALE_CHOICE";

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return typeof value === "string" && SUPPORTED_LOCALES.some((locale) => locale === value);
}

export function rememberLocaleChoice(locale: string): void {
  if (!isSupportedLocale(locale) || typeof document === "undefined") return;
  const attributes = `Path=/; Max-Age=31536000; SameSite=Lax${window.location.protocol === "https:" ? "; Secure" : ""}`;
  document.cookie = `${LOCALE_CHOICE_COOKIE}=${locale}; ${attributes}`;
  document.cookie = `NEXT_LOCALE=${locale}; ${attributes}`;
}
