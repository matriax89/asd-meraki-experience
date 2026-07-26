"use client";

import { useMemo, useState } from "react";
import { Popover } from "@radix-ui/themes";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { it } from "date-fns/locale";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, X } from "lucide-react";

type DateTimePickerProps = {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
  min?: string;
};

export function DateTimePicker({
  value,
  onChange,
  required = false,
  placeholder = "Scegli data e ora",
  min,
}: DateTimePickerProps) {
  const selectedValue = parseLocalDateTime(value);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Date>(() => selectedValue || roundedNow());
  const [visibleMonth, setVisibleMonth] = useState<Date>(() => startOfMonth(selectedValue || new Date()));

  const openPicker = (nextOpen: boolean) => {
    if (nextOpen) {
      const initial = parseLocalDateTime(value) || roundedNow();
      setDraft(initial);
      setVisibleMonth(startOfMonth(initial));
    }
    setOpen(nextOpen);
  };

  const calendarDays = useMemo(() => eachDayOfInterval({
    start: startOfWeek(startOfMonth(visibleMonth), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(visibleMonth), { weekStartsOn: 1 }),
  }), [visibleMonth]);

  const minimum = min ? parseLocalDateTime(min) : null;
  const minimumDay = minimum ? startOfLocalDay(minimum) : null;

  const selectDay = (day: Date) => {
    setDraft(current => new Date(
      day.getFullYear(),
      day.getMonth(),
      day.getDate(),
      current.getHours(),
      current.getMinutes(),
    ));
  };

  const setTime = (part: "hour" | "minute", nextValue: number) => {
    setDraft(current => {
      const next = new Date(current);
      if (part === "hour") next.setHours(nextValue);
      else next.setMinutes(nextValue);
      return next;
    });
  };

  const apply = () => {
    if (minimum && draft < minimum) {
      setDraft(minimum);
      onChange(toLocalDateTimeValue(minimum));
    } else {
      onChange(toLocalDateTimeValue(draft));
    }
    setOpen(false);
  };

  return (
    <Popover.Root open={open} onOpenChange={openPicker}>
      <Popover.Trigger>
        <button
          type="button"
          className="flex min-h-11 w-full items-center gap-3 rounded-lg border border-slate-300 bg-white px-3 text-left text-sm text-slate-900 outline-none transition hover:border-slate-400 focus:ring-4 focus:ring-indigo-100"
          aria-label={selectedValue ? `Data selezionata: ${formatDateTime(selectedValue)}` : placeholder}
        >
          <CalendarDays className="size-4 shrink-0 text-indigo-600" />
          <span className={`min-w-0 flex-1 truncate ${selectedValue ? "" : "text-slate-400"}`}>
            {selectedValue ? formatDateTime(selectedValue) : placeholder}
          </span>
          <Clock3 className="size-4 shrink-0 text-slate-400" />
        </button>
      </Popover.Trigger>

      <Popover.Content
        align="start"
        sideOffset={8}
        className="!w-[min(360px,calc(100vw-24px))] !rounded-2xl !border !border-slate-200 !bg-white !p-0 !shadow-2xl"
      >
        <div className="border-b border-slate-100 p-4">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setVisibleMonth(current => addMonths(current, -1))}
              className="grid size-9 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
              aria-label="Mese precedente"
            >
              <ChevronLeft className="size-4" />
            </button>
            <strong className="text-sm capitalize text-slate-900">
              {format(visibleMonth, "MMMM yyyy", { locale: it })}
            </strong>
            <button
              type="button"
              onClick={() => setVisibleMonth(current => addMonths(current, 1))}
              className="grid size-9 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
              aria-label="Mese successivo"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>

        <div className="p-4">
          <div className="mb-2 grid grid-cols-7 text-center text-[10px] font-bold uppercase tracking-wide text-slate-400">
            {["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"].map(day => <span key={day}>{day}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map(day => {
              const disabled = Boolean(minimumDay && startOfLocalDay(day) < minimumDay);
              const selected = isSameDay(day, draft);
              const today = isSameDay(day, new Date());
              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  disabled={disabled}
                  onClick={() => selectDay(day)}
                  className={`relative grid aspect-square place-items-center rounded-lg text-xs font-medium transition ${
                    selected
                      ? "bg-indigo-600 text-white shadow-sm"
                      : isSameMonth(day, visibleMonth)
                        ? "text-slate-800 hover:bg-slate-100"
                        : "text-slate-300 hover:bg-slate-50"
                  } disabled:cursor-not-allowed disabled:opacity-25`}
                  aria-label={format(day, "d MMMM yyyy", { locale: it })}
                  aria-pressed={selected}
                >
                  {day.getDate()}
                  {today && !selected && <span className="absolute bottom-1 size-1 rounded-full bg-indigo-500" />}
                </button>
              );
            })}
          </div>
        </div>

        <div className="border-t border-slate-100 bg-slate-50 p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-slate-600">
            <Clock3 className="size-4" /> Orario
          </div>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <TimeSelect
              label="Ora"
              value={draft.getHours()}
              values={Array.from({ length: 24 }, (_, index) => index)}
              onChange={value => setTime("hour", value)}
            />
            <span className="pt-5 font-bold text-slate-400">:</span>
            <TimeSelect
              label="Minuti"
              value={draft.getMinutes()}
              values={Array.from({ length: 60 }, (_, index) => index)}
              onChange={value => setTime("minute", value)}
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-slate-100 p-3">
          {!required && value ? (
            <button
              type="button"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-rose-600 hover:bg-rose-50"
            >
              <X className="size-3.5" /> Rimuovi
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <Popover.Close>
              <button type="button" className="min-h-9 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                Annulla
              </button>
            </Popover.Close>
            <button type="button" onClick={apply} className="min-h-9 rounded-lg bg-slate-950 px-4 text-xs font-semibold text-white hover:bg-slate-800">
              Applica
            </button>
          </div>
        </div>
      </Popover.Content>
    </Popover.Root>
  );
}

function TimeSelect({
  label,
  value,
  values,
  onChange,
}: {
  label: string;
  value: number;
  values: number[];
  onChange: (value: number) => void;
}) {
  return (
    <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
      {label}
      <select
        value={value}
        onChange={event => onChange(Number(event.target.value))}
        className="mt-1 block h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
      >
        {values.map(option => <option key={option} value={option}>{String(option).padStart(2, "0")}</option>)}
      </select>
    </label>
  );
}

function parseLocalDateTime(value?: string) {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  const parsed = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toLocalDateTimeValue(value: Date) {
  const part = (number: number) => String(number).padStart(2, "0");
  return `${value.getFullYear()}-${part(value.getMonth() + 1)}-${part(value.getDate())}T${part(value.getHours())}:${part(value.getMinutes())}`;
}

function roundedNow() {
  const now = new Date();
  now.setSeconds(0, 0);
  now.setMinutes(Math.ceil(now.getMinutes() / 5) * 5);
  return now;
}

function startOfLocalDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function formatDateTime(value: Date) {
  return format(value, "EEE d MMM yyyy, HH:mm", { locale: it });
}
