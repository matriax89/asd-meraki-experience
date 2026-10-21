export type ActivityTiming = {
  startsAt?: string | null;
  endsAt?: string | null;
  checkInStartsAt?: string | null;
};

const timingKeys = ["startsAt", "endsAt", "checkInStartsAt"] as const;

/** Ignore malformed legacy values instead of inventing an admission time. */
export function normalizedActivityTiming(value: ActivityTiming | null | undefined): ActivityTiming {
  return Object.fromEntries(timingKeys.flatMap((key) => {
    const date = value?.[key];
    return typeof date === "string" && Number.isFinite(Date.parse(date)) ? [[key, date]] : [];
  }));
}

/** Schedules are organizer information; purchase names and prices keep their snapshot. */
export function resolveActivityTiming(currentConfig: unknown, snapshotConfig: unknown, activityId: string): ActivityTiming {
  const find = (config: unknown) => {
    if (!config || typeof config !== "object" || !("activities" in config) || !Array.isArray(config.activities)) return undefined;
    return config.activities.find((activity): activity is ActivityTiming & { id: string } => Boolean(activity && typeof activity === "object" && activity.id === activityId));
  };
  return normalizedActivityTiming(find(currentConfig) || find(snapshotConfig));
}

export function hasActivityTiming(value: ActivityTiming): boolean {
  return Object.keys(normalizedActivityTiming(value)).length > 0;
}

export function activityTimingCopy(locale: string) {
  const copy = {
    it: { date: "Data", checkIn: "Apertura check-in", start: "Inizio attività", end: "Fine attività", timezone: "ora italiana (Europe/Rome)" },
    en: { date: "Date", checkIn: "Check-in opens", start: "Activity starts", end: "Activity ends", timezone: "Italian time (Europe/Rome)" },
    de: { date: "Datum", checkIn: "Check-in öffnet", start: "Beginn der Aktivität", end: "Ende der Aktivität", timezone: "italienische Zeit (Europe/Rome)" },
    es: { date: "Fecha", checkIn: "Apertura del check-in", start: "Inicio de la actividad", end: "Fin de la actividad", timezone: "hora de Italia (Europe/Rome)" },
  };
  return copy[locale as keyof typeof copy] || copy.it;
}

export function activityTimingRows(value: ActivityTiming, locale: string) {
  const timing = normalizedActivityTiming(value);
  const copy = activityTimingCopy(locale);
  const format = new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Europe/Rome" });
  return ([
    ["checkInStartsAt", copy.checkIn], ["startsAt", copy.start], ["endsAt", copy.end],
  ] as const).flatMap(([key, label]) => timing[key] ? [{ label, value: format.format(new Date(timing[key]!)), dateTime: timing[key]! }] : []);
}
