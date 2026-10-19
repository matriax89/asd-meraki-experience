"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Popover } from "@base-ui/react/popover";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, X } from "lucide-react";

export interface DateTimeFieldProps {
  id?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  description?: string;
  error?: string;
  min?: string;
  max?: string;
}

type CalendarDate = { year: number; month: number; day: number };
type Draft = { source: string; date: string; time: string };
const weekdays = ["Lu", "Ma", "Me", "Gi", "Ve", "Sa", "Do"];
const weekdayNames = ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"];
const pad = (value: number) => String(value).padStart(2, "0");
const dateKey = ({ year, month, day }: CalendarDate) => `${year}-${pad(month)}-${pad(day)}`;
const displayDate = ({ year, month, day }: CalendarDate) => `${pad(day)}/${pad(month)}/${year}`;
const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

function parseDate(value: string): CalendarDate | null {
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const [, dayText, monthText, yearText] = match;
  const day = Number(dayText); const month = Number(monthText); const year = Number(yearText);
  return year >= 1000 && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month) ? { year, month, day } : null;
}

function parseTime(value: string): string | null {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return null;
  return `${pad(Number(match[1]))}:${match[2]}`;
}

function draftFromValue(value: string): Draft {
  const [day = "", time = ""] = value.split("T");
  const match = day.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return { source: value, date: match ? `${match[3]}/${match[2]}/${match[1]}` : day, time: time.slice(0, 5) };
}

function dateFromWallTime(value?: string): CalendarDate | null {
  return value ? parseDate(draftFromValue(value).date) : null;
}

function todayInRome(): CalendarDate {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: read("year"), month: read("month"), day: read("day") };
}

// Calendar arithmetic uses UTC solely for civil dates, never the browser's zone.
function shiftDate(value: CalendarDate, days: number): CalendarDate {
  const date = new Date(Date.UTC(value.year, value.month - 1, value.day + days));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function shiftMonth(value: CalendarDate, months: number): CalendarDate {
  const date = new Date(Date.UTC(value.year, value.month - 1 + months, 1));
  const year = date.getUTCFullYear(); const month = date.getUTCMonth() + 1;
  return { year, month, day: Math.min(value.day, daysInMonth(year, month)) };
}

/** A Rome wall-time editor. Consumers still validate DST with fromRomeInput. */
export function DateTimeField({ id, label, value, onChange, required = false, disabled = false, description, error, min, max }: DateTimeFieldProps) {
  const generatedId = useId();
  const fieldId = id || generatedId;
  const [draft, setDraft] = useState(() => draftFromValue(value));
  const [open, setOpen] = useState(false);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const [showValidation, setShowValidation] = useState(false);
  const [month, setMonth] = useState(() => parseDate(draft.date) || todayInRome());
  const [focusDay, setFocusDay] = useState(() => dateKey(month));
  const dateInput = useRef<HTMLInputElement>(null);
  const timeInput = useRef<HTMLInputElement>(null);
  const dayButtons = useRef(new Map<string, HTMLButtonElement>());
  const focusTimeOnClose = useRef(false);
  if (draft.source !== value) setDraft(draftFromValue(value));
  if (disabled && open) setOpen(false);

  const parsedDate = parseDate(draft.date);
  const parsedTime = parseTime(draft.time);
  const wallValue = parsedDate && parsedTime ? `${dateKey(parsedDate)}T${parsedTime}` : "";
  const rangeError = wallValue && ((min && wallValue < min) || (max && wallValue > max))
    ? "La data e l’ora non rientrano nell’intervallo consentito." : "";
  const dateError = draft.date && !parsedDate ? "Inserisci una data valida nel formato gg/mm/aaaa." : rangeError;
  const timeError = draft.time && !parsedTime ? "Inserisci un orario valido da 00:00 a 23:59." : "";
  const visibleError = error || (showValidation ? dateError || timeError : "");
  const describedBy = [description ? `${fieldId}-description` : "", visibleError ? `${fieldId}-error` : "", `${fieldId}-format`].filter(Boolean).join(" ");
  const selectedDay = parsedDate ? dateKey(parsedDate) : "";
  const monthTitle = new Intl.DateTimeFormat("it-IT", { timeZone: "UTC", month: "long", year: "numeric" }).format(new Date(Date.UTC(month.year, month.month - 1, 1)));
  const leading = (new Date(Date.UTC(month.year, month.month - 1, 1)).getUTCDay() + 6) % 7;
  const monthDays = daysInMonth(month.year, month.month);
  const inputClass = "min-h-12 w-full min-w-0 rounded-xl border border-[#dddfd4] bg-[#fffefa] py-3 text-base text-[#18251f] outline-none transition focus:border-[#a38a59] focus:ring-2 focus:ring-[#c2a36b]/25 disabled:cursor-not-allowed disabled:opacity-50";
  const buttonClass = "inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-[#52604f] outline-none transition hover:bg-[#eeede7] focus-visible:ring-2 focus-visible:ring-[#a38a59] disabled:cursor-not-allowed disabled:opacity-35";

  useEffect(() => {
    dateInput.current?.setCustomValidity(error || dateError || "");
    timeInput.current?.setCustomValidity(error || timeError || "");
  }, [dateError, error, timeError]);
  useEffect(() => {
    if (open) dayButtons.current.get(focusDay)?.focus();
  }, [open, focusDay, month]);

  const update = (date: string, time: string) => {
    const day = parseDate(date); const clock = parseTime(time);
    const next = day && clock ? `${dateKey(day)}T${clock}` : "";
    setDraft({ source: next, date, time });
    onChange(next);
  };
  const openCalendar = (next: boolean) => {
    if (next) {
      const start = clampDay(parseDate(draft.date) || todayInRome());
      setMonth(start); setFocusDay(dateKey(start)); focusTimeOnClose.current = false;
      setPortalContainer(dateInput.current?.closest("dialog") || null);
    }
    setOpen(next);
  };
  const dayAllowed = (day: CalendarDate) => {
    const key = dateKey(day);
    return (!min || key >= min.slice(0, 10)) && (!max || key <= max.slice(0, 10));
  };
  const clampDay = (day: CalendarDate): CalendarDate => {
    const key = dateKey(day);
    if (min && key < min.slice(0, 10)) return dateFromWallTime(min) || day;
    if (max && key > max.slice(0, 10)) return dateFromWallTime(max) || day;
    return day;
  };
  const monthAllowed = (offset: number) => {
    const target = shiftMonth({ ...month, day: 1 }, offset);
    return (!max || dateKey(target) <= max.slice(0, 10))
      && (!min || dateKey({ ...target, day: daysInMonth(target.year, target.month) }) >= min.slice(0, 10));
  };
  const selectDay = (day: CalendarDate) => {
    if (!dayAllowed(day)) return;
    update(displayDate(day), draft.time);
    focusTimeOnClose.current = !parsedTime;
    setOpen(false);
  };
  const moveFocus = (day: CalendarDate) => {
    const target = clampDay(day);
    if (!dayAllowed(target) || target.year < 1000 || target.year > 9999) return;
    setMonth(target); setFocusDay(dateKey(target));
  };
  const onDayKeyDown = (event: KeyboardEvent<HTMLButtonElement>, day: CalendarDate) => {
    let next: CalendarDate | undefined;
    if (event.key === "ArrowLeft") next = shiftDate(day, -1);
    else if (event.key === "ArrowRight") next = shiftDate(day, 1);
    else if (event.key === "ArrowUp") next = shiftDate(day, -7);
    else if (event.key === "ArrowDown") next = shiftDate(day, 7);
    else if (event.key === "Home") next = shiftDate(day, -((new Date(Date.UTC(day.year, day.month - 1, day.day)).getUTCDay() + 6) % 7));
    else if (event.key === "End") next = shiftDate(day, 6 - ((new Date(Date.UTC(day.year, day.month - 1, day.day)).getUTCDay() + 6) % 7));
    else if (event.key === "PageUp") next = shiftMonth(day, event.shiftKey ? -12 : -1);
    else if (event.key === "PageDown") next = shiftMonth(day, event.shiftKey ? 12 : 1);
    if (next) { event.preventDefault(); moveFocus(next); }
  };

  return <fieldset disabled={disabled} className="min-w-0 space-y-2">
    <legend className="mb-2 text-sm font-semibold text-[#18251f]">{label}{required ? " *" : ""}</legend>
    <div className="flex min-w-0 flex-wrap items-start gap-2">
      <div className="relative min-w-0 flex-[1_1_130px]">
        <input ref={dateInput} id={fieldId} type="text" inputMode="numeric" autoComplete="off" maxLength={10} value={draft.date} placeholder="gg/mm/aaaa" aria-label={`Data · ${label}`} aria-invalid={Boolean(error || dateError)} aria-describedby={describedBy} required={required || Boolean(draft.time)} className={`${inputClass} px-3`} onFocus={() => setOpen(false)} onBlur={() => { setShowValidation(true); if (parsedDate) update(displayDate(parsedDate), draft.time); }} onChange={(event) => {
          let next = event.target.value;
          if (/^\d{8}$/.test(next)) next = `${next.slice(0, 2)}/${next.slice(2, 4)}/${next.slice(4)}`;
          update(next, draft.time);
        }} />
      </div>
      <div className="flex max-w-full shrink-0 items-start gap-2">
      <div className="relative w-[100px] min-w-[80px] shrink">
        <Clock3 aria-hidden="true" className="pointer-events-none absolute left-2.5 top-4 h-4 w-4 text-[#8a7955]" />
        <input ref={timeInput} id={`${fieldId}-time`} type="text" inputMode="numeric" autoComplete="off" maxLength={5} value={draft.time} placeholder="HH:mm" aria-label={`Ora · ${label}`} aria-invalid={Boolean(error || timeError || rangeError)} aria-describedby={describedBy} required={required || Boolean(draft.date)} className={`${inputClass} pl-8 pr-2`} onFocus={() => setOpen(false)} onBlur={() => { setShowValidation(true); if (parsedTime) update(draft.date, parsedTime); }} onChange={(event) => {
          let next = event.target.value;
          if (/^\d{4}$/.test(next)) next = `${next.slice(0, 2)}:${next.slice(2)}`;
          update(draft.date, next);
        }} />
      </div>
      <Popover.Root open={open} onOpenChange={openCalendar} modal={false}>
        <Popover.Trigger type="button" disabled={disabled} aria-label={`Apri calendario · ${label}`} className={`${buttonClass} min-h-12 shrink-0 border border-[#dddfd4] bg-[#fffefa]`}><CalendarDays className="h-5 w-5 text-[#9e885d]" aria-hidden="true" /></Popover.Trigger>
        <Popover.Portal container={portalContainer ?? undefined}>
          <Popover.Positioner side="bottom" align="end" sideOffset={8} collisionPadding={12} positionMethod="fixed" className="z-[120]">
            <Popover.Popup aria-label={`Calendario · ${label}`} initialFocus={() => dayButtons.current.get(focusDay) || true} finalFocus={() => focusTimeOnClose.current ? timeInput.current : true} className="w-[min(320px,calc(100vw-24px))] max-h-[min(450px,var(--available-height))] overflow-y-auto rounded-2xl border border-[#dddfd4] bg-[#fffefa] p-3 text-[#18251f] shadow-[0_16px_48px_#18251f26] outline-none">
              <div className="mb-2 flex items-center justify-between gap-1">
                <button type="button" aria-label="Mese precedente" className={buttonClass} disabled={!monthAllowed(-1)} onClick={() => moveFocus(shiftMonth(month, -1))}><ChevronLeft className="h-4 w-4" aria-hidden="true" /></button>
                <Popover.Title className="text-sm font-semibold capitalize" aria-live="polite">{monthTitle}</Popover.Title>
                <button type="button" aria-label="Mese successivo" className={buttonClass} disabled={!monthAllowed(1)} onClick={() => moveFocus(shiftMonth(month, 1))}><ChevronRight className="h-4 w-4" aria-hidden="true" /></button>
                <Popover.Close type="button" aria-label="Chiudi calendario" className={buttonClass}><X className="h-4 w-4" aria-hidden="true" /></Popover.Close>
              </div>
              <table role="grid" aria-label={monthTitle} className="w-full table-fixed border-collapse text-center text-sm">
                <thead><tr>{weekdays.map((day, index) => <th key={day} scope="col" abbr={weekdayNames[index]} className="h-8 text-[10px] font-semibold uppercase tracking-wide text-[#828b78]">{day}</th>)}</tr></thead>
                <tbody>{Array.from({ length: Math.ceil((leading + monthDays) / 7) }, (_, week) => <tr key={week}>{Array.from({ length: 7 }, (_, weekday) => {
                  const dayNumber = week * 7 + weekday - leading + 1;
                  if (dayNumber < 1 || dayNumber > monthDays) return <td key={weekday} />;
                  const day = { year: month.year, month: month.month, day: dayNumber }; const key = dateKey(day);
                  const fullDate = new Intl.DateTimeFormat("it-IT", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(Date.UTC(day.year, day.month - 1, day.day)));
                  return <td key={weekday} aria-selected={key === selectedDay}><button ref={(element) => { if (element) dayButtons.current.set(key, element); else dayButtons.current.delete(key); }} type="button" disabled={!dayAllowed(day)} tabIndex={key === focusDay ? 0 : -1} aria-label={fullDate} className={`my-0.5 min-h-10 w-full rounded-xl text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-[#a38a59] disabled:cursor-not-allowed disabled:opacity-25 ${key === selectedDay ? "bg-[#18251f] font-semibold text-[#f4e6ce]" : "hover:bg-[#eeede7]"}`} onClick={() => selectDay(day)} onKeyDown={(event) => onDayKeyDown(event, day)}>{dayNumber}</button></td>;
                })}</tr>)}</tbody>
              </table>
              <div className="mt-2 flex items-center justify-between border-t border-[#e3e5dd] pt-2">
                <button type="button" className={`${buttonClass} px-3 text-xs font-semibold`} disabled={!dayAllowed(todayInRome())} onClick={() => selectDay(todayInRome())}>Oggi</button>
                <button type="button" className={`${buttonClass} px-3 text-xs`} onClick={() => { update("", ""); setOpen(false); }}>Svuota</button>
              </div>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
      </div>
    </div>
    <p id={`${fieldId}-format`} className="text-[11px] leading-5 text-[#7f8777]">Giorno/mese/anno · Ora 24 h · Orario italiano</p>
    {description && <p id={`${fieldId}-description`} className="text-xs leading-5 text-[#6c7767]">{description}</p>}
    {visibleError && <p id={`${fieldId}-error`} role="alert" className="text-xs leading-5 text-red-700">{visibleError}</p>}
  </fieldset>;
}
