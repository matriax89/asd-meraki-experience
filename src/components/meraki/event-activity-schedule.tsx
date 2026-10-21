import { Clock3, DoorOpen, Music2, Sparkles } from "lucide-react";
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
    <section data-activity-schedule aria-label={copy.title} className="min-w-0 py-5">
      <h2 className="mb-3 text-sm font-semibold tracking-[-0.01em]">{copy.title}</h2>
      <ul className="grid min-w-0 gap-3 sm:grid-cols-2" role="list">
        {scheduled.map(({ activity, start, end, checkIn }) => {
          const name = commerceText(activity.name, activity.nameTranslations, locale);
          const Icon = activity.kind === "workshop" ? Sparkles : activity.kind === "masterclass" ? Music2 : Clock3;
          const gold = activity.kind === "workshop";
          const date = start || checkIn || end!;
          return (
            <li key={activity.id} data-activity-id={activity.id} className={`min-w-0 rounded-[18px] border p-4 sm:p-5 ${gold ? "border-[#e5ddc8] bg-[#faf8f2]" : "border-[#dde4d7] bg-[#f4f7f0]"}`}>
              <article aria-label={name} className="min-w-0">
                <header className="mb-4 flex min-w-0 items-start gap-2.5">
                  <Icon className={`mt-0.5 h-[18px] w-[18px] shrink-0 ${gold ? "text-[#9e885d]" : "text-[#738463]"}`} aria-hidden="true" />
                  <div className="min-w-0">
                    <h3 className="break-words text-sm font-semibold leading-5 text-[#18251f]">{name}</h3>
                    {reference && day(date) !== day(reference) ? <time dateTime={date} className="mt-1 block text-xs text-[#727b6a]">{day(date)}</time> : null}
                  </div>
                </header>
                {checkIn ? <div data-activity-check-in className="mb-4 flex min-w-0 items-start gap-2 rounded-[12px] border border-[#18251f]/5 bg-white/80 px-3 py-2.5">
                  <DoorOpen className="mt-0.5 h-4 w-4 shrink-0 text-[#738463]" aria-hidden="true" />
                  <div className="min-w-0"><p className="text-[11px] font-medium leading-4 text-[#69755f]">{copy.checkIn}</p><time dateTime={checkIn} className="mt-1 block break-words text-lg font-semibold leading-6 tracking-[-0.02em] text-[#263a2c]">{clock(checkIn, date)}</time></div>
                </div> : null}
                {start || end ? <dl className="min-w-0">
                  <dt className="mb-1 text-[11px] leading-4 text-[#727b6a]">{start && end ? copy.schedule : start ? copy.start : copy.end}</dt>
                  <dd data-activity-time className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-1 text-base font-semibold leading-6 text-[#18251f]">
                    {start ? <time dateTime={start}>{clock(start, date)}</time> : null}
                    {start && end ? <span aria-hidden="true">–</span> : null}
                    {end ? <time dateTime={end}>{clock(end, date)}</time> : null}
                  </dd>
                </dl> : null}
              </article>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-[11px] leading-5 text-[#7f8777]">{copy.zone}</p>
    </section>
  );
}
