import type { CommerceActivity } from "@/lib/commerce/types";
import { commerceText } from "@/lib/commerce/localization";

const labels = {
  it: { title: "Programma e check-in", zone: "Tutti gli orari sono in ora italiana (Europe/Rome).", checkIn: "Check-in dalle", schedule: "Orario attività", start: "Inizio attività", end: "Fine attività" },
  en: { title: "Schedule and check-in", zone: "All times are in Italian time (Europe/Rome).", checkIn: "Check-in opens at", schedule: "Activity time", start: "Activity starts", end: "Activity ends" },
  de: { title: "Programm und Check-in", zone: "Alle Uhrzeiten gelten für Italien (Europe/Rome).", checkIn: "Check-in ab", schedule: "Uhrzeit", start: "Beginn", end: "Ende" },
  es: { title: "Programa y check-in", zone: "Todos los horarios corresponden a la hora de Italia (Europe/Rome).", checkIn: "Check-in desde", schedule: "Horario de la actividad", start: "Inicio de la actividad", end: "Fin de la actividad" },
};

const instant = (value: unknown): string | null => typeof value === "string" && value.trim() && Number.isFinite(Date.parse(value)) ? value : null;
const format = (value: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("it-IT", { ...options, timeZone: "Europe/Rome", hourCycle: "h23" }).format(new Date(value));
const day = (value: string) => format(value, { year: "numeric", month: "2-digit", day: "2-digit" });
const clock = (value: string, reference: string | null) => format(value, { ...(reference && day(value) !== day(reference) ? { year: "numeric", month: "2-digit", day: "2-digit" } : {}), hour: "2-digit", minute: "2-digit" });

function scheduledActivities(activities: readonly CommerceActivity[]) {
  return activities.flatMap((activity, index) => {
    const start = instant(activity.startsAt);
    const end = instant(activity.endsAt);
    const checkIn = instant(activity.checkInStartsAt);
    return start || end || checkIn ? [{ activity, start, end, checkIn, index }] : [];
  }).sort((left, right) => Date.parse(left.start || left.checkIn || left.end!) - Date.parse(right.start || right.checkIn || right.end!) || left.index - right.index);
}

export function hasActivitySchedule(activities: readonly CommerceActivity[]) {
  return activities.some(activity => instant(activity.startsAt) || instant(activity.endsAt) || instant(activity.checkInStartsAt));
}

export function EventActivitySchedule({ activities, locale, eventStartsAt }: { activities: readonly CommerceActivity[]; locale: string; eventStartsAt?: string | null }) {
  const scheduled = scheduledActivities(activities);
  if (!scheduled.length) return null;
  const copy = labels[locale as keyof typeof labels] || labels.it;
  const reference = instant(eventStartsAt) || scheduled[0].start || scheduled[0].checkIn || scheduled[0].end;
  return (
    <section data-activity-schedule aria-label={copy.title} className="min-w-0 py-3">
      <h2 className="mb-1 text-xs font-medium text-[#727b6a]">{copy.title}</h2>
      <ul className="min-w-0 divide-y divide-[#e5e6df]" role="list">
        {scheduled.map(({ activity, start, end, checkIn }) => {
          const name = commerceText(activity.name, activity.nameTranslations, locale);
          const date = start || checkIn || end!;
          return (
            <li key={activity.id} data-activity-id={activity.id} className="min-w-0 py-3">
              <article aria-label={name} className="min-w-0">
                <header className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <div className="min-w-0 flex-[1_1_8rem]">
                    <h3 className="break-words text-[15px] font-semibold leading-6 text-[#18251f]">{name}</h3>
                    {reference && day(date) !== day(reference) ? <time dateTime={date} className="block text-xs leading-5 text-[#727b6a]">{day(date)}</time> : null}
                  </div>
                  {start || end ? <dl className="min-w-0 max-w-full">
                    <dt className={start && end ? "sr-only" : "text-[11px] leading-4 text-[#727b6a]"}>{start && end ? copy.schedule : start ? copy.start : copy.end}</dt>
                    <dd data-activity-time className="flex min-w-0 flex-wrap items-baseline gap-x-1 gap-y-0.5 text-[15px] font-semibold leading-6 tabular-nums text-[#18251f]">
                      {start ? <time dateTime={start}>{clock(start, date)}</time> : null}
                      {start && end ? <span aria-hidden="true">–</span> : null}
                      {end ? <time dateTime={end}>{clock(end, date)}</time> : null}
                    </dd>
                  </dl> : null}
                </header>
                {checkIn ? <p data-activity-check-in className="mt-0.5 break-words text-[13px] leading-5 text-[#727b6a]">
                  {copy.checkIn}{" "}<time dateTime={checkIn} className="font-medium tabular-nums">{clock(checkIn, date)}</time>
                </p> : null}
              </article>
            </li>
          );
        })}
      </ul>
      <p className="mt-1 text-[10px] leading-4 text-[#7f8777]">{copy.zone}</p>
    </section>
  );
}
