import { z } from "zod";

export type LocalizedText = Record<"it" | "en" | "de" | "es", string>;

const localizedText = (maximum: number) => z.object({
  it: z.string().trim().max(maximum),
  en: z.string().trim().max(maximum),
  de: z.string().trim().max(maximum),
  es: z.string().trim().max(maximum),
}).strict();
const id = z.string().trim().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/);
const optionalUrl = z.string().trim().max(2048).pipe(z.union([
  z.literal(""),
  z.url({ protocol: /^https?$/ }),
]));
const optionalEmail = z.string().trim().max(254).pipe(z.union([z.literal(""), z.email()]));

const accommodationSchema = z.object({
  id,
  kind: z.enum(["partner", "suggested"]),
  name: z.string().trim().min(1, "Inserisci il nome della struttura.").max(200),
  address: z.string().trim().max(500),
  mapUrl: optionalUrl,
  bookingUrl: optionalUrl,
  phone: z.string().trim().max(80),
  email: optionalEmail,
  distance: localizedText(300),
  rate: localizedText(500),
  benefits: localizedText(1500),
  bookingInstructions: localizedText(2000),
  validUntil: z.iso.date().nullable(),
}).strict();

const connectionModeSchema = z.enum(["plane", "train", "bus", "shuttle", "taxi", "car", "walk", "other"]);
const arrivalConnectionSchema = z.object({
  id,
  mode: connectionModeSchema,
  from: localizedText(300).refine((value) => Boolean(value.it), {
    message: "Inserisci il punto di partenza del collegamento in italiano.", path: ["it"],
  }),
  to: localizedText(300).refine((value) => Boolean(value.it), {
    message: "Inserisci la destinazione del collegamento in italiano.", path: ["it"],
  }),
  service: localizedText(200),
  duration: localizedText(120),
  description: localizedText(2000),
  linkUrl: optionalUrl,
  mapUrl: optionalUrl,
}).strict();

const arrivalSchema = z.object({
  id,
  mode: z.enum(["plane", "train", "bus", "car"]),
  title: localizedText(160).refine((value) => Boolean(value.it), {
    message: "Inserisci il titolo del percorso in italiano.", path: ["it"],
  }),
  description: localizedText(4000),
  linkUrl: optionalUrl,
  arrivalPoint: localizedText(300).optional(),
  connections: z.array(arrivalConnectionSchema).max(8, "Puoi aggiungere fino a 8 collegamenti per percorso.").optional(),
}).strict().superRefine((value, context) => {
  const ids = new Set<string>();
  value.connections?.forEach((connection, index) => {
    if (ids.has(connection.id)) context.addIssue({ code: "custom", message: "Ogni collegamento deve avere un identificativo univoco nel percorso.", path: ["connections", index, "id"] });
    ids.add(connection.id);
  });
});

export type Accommodation = z.infer<typeof accommodationSchema>;
export type Arrival = z.infer<typeof arrivalSchema>;
export type ArrivalConnection = z.infer<typeof arrivalConnectionSchema>;
export type TravelConnectionMode = z.infer<typeof connectionModeSchema>;

const logisticsObjectSchema = z.object({
  version: z.literal(1),
  accommodations: z.array(accommodationSchema).max(12),
  arrivals: z.array(arrivalSchema).max(16),
  accessibility: localizedText(2000),
  contact: localizedText(1000),
}).strict().superRefine((value, context) => {
  for (const key of ["accommodations", "arrivals"] as const) {
    const ids = new Set<string>();
    value[key].forEach((row, index) => {
      if (ids.has(row.id)) context.addIssue({ code: "custom", message: "Ogni voce deve avere un identificativo univoco.", path: [key, index, "id"] });
      ids.add(row.id);
    });
  }
});

export type EventLogistics = z.infer<typeof logisticsObjectSchema>;
export const eventLogisticsSchema = logisticsObjectSchema.nullable();

/** Invalid or legacy data is absent; callers never render unvalidated links. */
export function parseEventLogistics(value: unknown): EventLogistics | null {
  const parsed = eventLogisticsSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function emptyEventLogistics(): EventLogistics {
  const text = (): LocalizedText => ({ it: "", en: "", de: "", es: "" });
  return { version: 1, accommodations: [], arrivals: [], accessibility: text(), contact: text() };
}

/** Plain text only: consumers render this string with React's normal escaping. */
export function logisticsText(value: LocalizedText | null | undefined, locale: string): string {
  if (!value) return "";
  const language = (["it", "en", "de", "es"] as const).find((code) => code === locale.toLowerCase().split("-")[0]);
  return [language ? value[language] : "", value.it, value.en].find((text) => text?.trim())?.trim() || "";
}

export function hasEventLogistics(value: unknown, locale?: string): boolean {
  const parsed = parseEventLogistics(value);
  if (!parsed) return false;
  if (parsed.accommodations.length || parsed.arrivals.length) return true;
  if (locale) return Boolean(logisticsText(parsed.accessibility, locale) || logisticsText(parsed.contact, locale));
  return Object.values(parsed.accessibility).some(Boolean) || Object.values(parsed.contact).some(Boolean);
}
