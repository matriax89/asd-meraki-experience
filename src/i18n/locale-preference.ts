import { isSupportedLocale, type SupportedLocale } from "./locale-choice";

interface PublicLocaleRequest {
  pathname: string;
  method: string;
  acceptLanguage?: string | null;
  manualLocale?: string;
  previousLocale?: string;
  userAgent?: string | null;
  isPrefetch?: boolean;
  isServerNavigation?: boolean;
}

// Italian links are often shared from the organizer's browser. Negotiate them
// on document visits, while retaining explicit translations and operational URLs.
const discoveryPath = /^\/(?:$|(?:eventi|workshop|corsi|sponsors)(?:\/[^/]+)?\/?$|(?:chi-siamo|contatti|orario|prova-gratuita)\/?$|legal\/(?:privacy-policy|cookie-policy|termini-e-condizioni)\/?$)/;
const crawler = /bot\b|crawler|spider|slurp|facebookexternalhit|facebookcatalog|meta-externalagent|meta-externalfetcher|pinterest|skypeuripreview|embedly/i;

/** Browser preferences, including regional tags; English serves unsupported languages. */
export function browserLocale(acceptLanguage?: string | null): SupportedLocale {
  const preferences = (acceptLanguage ?? "").split(",").flatMap((entry, index) => {
    const [tag, ...parameters] = entry.trim().split(";");
    const quality = parameters.find((part) => /^\s*q=/i.test(part));
    const weight = quality ? Number(quality.split("=")[1]) : 1;
    if (!tag || tag === "*" || !Number.isFinite(weight) || weight <= 0 || weight > 1) return [];
    try {
      return [{ language: new Intl.Locale(tag).language.toLowerCase(), weight, index }];
    } catch {
      return [];
    }
  }).sort((a, b) => b.weight - a.weight || a.index - b.index);

  for (const preference of preferences) {
    if (isSupportedLocale(preference.language)) return preference.language;
  }
  return preferences.length ? "en" : "it";
}

/** Returns only a same-site pathname; the caller retains the original query. */
export function publicLocaleRedirect(request: PublicLocaleRequest): string | null {
  const userAgent = request.userAgent ?? "";
  // Preview fetchers use WhatsApp/..., whereas real in-app browsers use Mozilla/....
  const isCrawler = crawler.test(userAgent) || /^WhatsApp(?:\/|\b)/i.test(userAgent);
  if (!["GET", "HEAD"].includes(request.method) || request.isPrefetch || request.isServerNavigation || isCrawler) return null;

  const segments = request.pathname.split("/");
  const prefix = segments[1];
  if (isSupportedLocale(prefix) && prefix !== "it") return null;
  const pathname = prefix === "it" ? `/${segments.slice(2).join("/")}` : request.pathname;
  if (!discoveryPath.test(pathname)) return null;

  // NEXT_LOCALE=it may have been written automatically after opening /it/ from
  // abroad. Only the explicit-choice cookie makes that legacy value intentional.
  const locale = isSupportedLocale(request.manualLocale)
    ? request.manualLocale
    : isSupportedLocale(request.previousLocale) && request.previousLocale !== "it"
      ? request.previousLocale
      : browserLocale(request.acceptLanguage);
  const destination = `/${locale}${pathname === "/" ? "" : pathname}`;
  return destination === request.pathname ? null : destination;
}
