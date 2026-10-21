const dateLocales = { it: "it-IT", en: "en-GB", de: "de-DE", es: "es-ES" } as const;

/** Translate calendar words while retaining Italian numeric dates and venue time. */
export function formatEventDate(value: string | number | Date, locale: string, options: Intl.DateTimeFormatOptions = {}) {
  const language = locale.toLowerCase().split(/[-_]/)[0] as keyof typeof dateLocales;
  const hasCalendarWords = Boolean(options.weekday
    || options.month && ["long", "short", "narrow"].includes(options.month)
    || options.dateStyle && options.dateStyle !== "short");
  const translatedLocale = dateLocales[language];
  const formattingLocale = hasCalendarWords && typeof translatedLocale === "string" ? translatedLocale : dateLocales.it;
  const formatter = new Intl.DateTimeFormat(formattingLocale, {
    ...options,
    timeZone: "Europe/Rome",
    hourCycle: "h23",
    hour12: false,
  });
  return formatter.formatToParts(value instanceof Date ? value : new Date(value))
    .map(part => part.type === "hour" ? part.value.padStart(2, "0") : part.value).join("");
}
