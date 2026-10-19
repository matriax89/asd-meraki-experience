"use client";

import { useEffect, useRef, useState } from "react";
import { Input, MultilingualInput, MultilingualTextarea, Select } from "@/components/admin/form-elements";
import type { Accommodation, Arrival, EventLogistics, LocalizedText } from "@/lib/events/logistics";

const blankText = (): LocalizedText => ({ it: "", en: "", de: "", es: "" });
const cardClass = "min-w-0 rounded-2xl border border-[#dedfd4] bg-[#fffefa]";
const secondaryButton = "min-h-11 rounded-xl border border-[#d9ddcf] px-4 text-sm font-semibold text-[#52604f] disabled:opacity-40";

function dateText(value: string | null) { return value ? value.split("-").reverse().join("/") : ""; }
function isoDate(value: string): string | null {
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  if (Number(year) < 1000) return null;
  const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  const date = new Date(`${iso}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : null;
}

function ValidUntilField({ value, label, path, onChange }: { value: string | null; label: string; path: string; onChange: (value: string | null) => void }) {
  const [draft, setDraft] = useState(() => ({ source: value, text: dateText(value) }));
  const input = useRef<HTMLInputElement>(null);
  if (draft.source !== value) setDraft({ source: value, text: dateText(value) });
  const error = draft.text && !isoDate(draft.text) ? "Inserisci una data valida nel formato gg/mm/aaaa." : "";
  useEffect(() => { input.current?.setCustomValidity(error); }, [error]);
  return <Input ref={input} label={label} data-logistics-path={path} type="text" inputMode="numeric" placeholder="gg/mm/aaaa · facoltativa" maxLength={10} value={draft.text} aria-invalid={Boolean(error)} error={error || undefined} onChange={(event) => {
    let text = event.target.value;
    if (/^\d{8}$/.test(text)) text = `${text.slice(0, 2)}/${text.slice(2, 4)}/${text.slice(4)}`;
    const next = isoDate(text);
    setDraft({ source: next, text });
    onChange(next);
  }} />;
}

function AccommodationFields({ value, index, onChange, onRemove }: { value: Accommodation; index: number; onChange: (patch: Partial<Accommodation>) => void; onRemove: () => void }) {
  const [open, setOpen] = useState(!value.name);
  const path = (field: string) => `accommodations.${index}.${field}`;
  return <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)} className={cardClass} data-accommodation={value.id}>
    <summary className="cursor-pointer break-words p-4 text-sm font-semibold text-[#263a2c] sm:p-5">{value.name || `Nuova struttura ${index + 1}`} <span className="ml-2 font-normal text-[#7a8272]">{value.kind === "partner" ? "Convenzionata" : "Consigliata"}</span></summary>
    <div className="space-y-5 border-t border-[#e4e5dc] p-4 sm:p-5">
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <Input label="Nome struttura *" data-logistics-path={path("name")} value={value.name} required maxLength={200} onChange={(event) => onChange({ name: event.target.value })} />
        <Select label="Tipo di struttura" value={value.kind} options={[{ value: "suggested", label: "Struttura consigliata" }, { value: "partner", label: "Struttura convenzionata" }]} onChange={(event) => onChange({ kind: event.target.value as Accommodation["kind"] })} />
        <Input label="Indirizzo struttura" data-logistics-path={path("address")} value={value.address} maxLength={500} onChange={(event) => onChange({ address: event.target.value })} />
        <Input label="Link mappa" data-logistics-path={path("mapUrl")} type="url" placeholder="https://…" value={value.mapUrl} maxLength={2048} onChange={(event) => onChange({ mapUrl: event.target.value })} />
        <Input label="Link prenotazione" data-logistics-path={path("bookingUrl")} type="url" placeholder="https://…" value={value.bookingUrl} maxLength={2048} onChange={(event) => onChange({ bookingUrl: event.target.value })} />
        <Input label="Telefono struttura" data-logistics-path={path("phone")} type="tel" value={value.phone} maxLength={80} onChange={(event) => onChange({ phone: event.target.value })} />
        <Input label="Email struttura" data-logistics-path={path("email")} type="email" value={value.email} maxLength={254} onChange={(event) => onChange({ email: event.target.value })} />
        <ValidUntilField value={value.validUntil} label={value.kind === "partner" ? "Convenzione valida fino al" : "Informazioni valide fino al"} path={path("validUntil")} onChange={(validUntil) => onChange({ validUntil })} />
        <MultilingualInput label="Distanza dall’evento" data-logistics-path={path("distance")} value={value.distance} maxLength={300} onChange={(distance) => onChange({ distance })} />
        <MultilingualInput label="Tariffa o prezzo indicativo" data-logistics-path={path("rate")} value={value.rate} maxLength={500} onChange={(rate) => onChange({ rate })} />
      </div>
      <MultilingualTextarea label={value.kind === "partner" ? "Vantaggi della convenzione" : "Servizi e vantaggi indicati"} data-logistics-path={path("benefits")} value={value.benefits} maxLength={1500} onChange={(benefits) => onChange({ benefits })} />
      <MultilingualTextarea label="Come prenotare la struttura" data-logistics-path={path("bookingInstructions")} value={value.bookingInstructions} maxLength={2000} onChange={(bookingInstructions) => onChange({ bookingInstructions })} />
      <button type="button" onClick={onRemove} className="min-h-11 rounded-xl px-3 text-sm font-semibold text-rose-700">Rimuovi struttura</button>
    </div>
  </details>;
}

function ArrivalFields({ value, index, onChange, onRemove }: { value: Arrival; index: number; onChange: (patch: Partial<Arrival>) => void; onRemove: () => void }) {
  const [open, setOpen] = useState(!value.title.it);
  const path = (field: string) => `arrivals.${index}.${field}`;
  return <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)} className={cardClass} data-arrival={value.id}>
    <summary className="cursor-pointer break-words p-4 text-sm font-semibold text-[#263a2c] sm:p-5">{value.title.it || `Nuovo percorso ${index + 1}`}</summary>
    <div className="space-y-5 border-t border-[#e4e5dc] p-4 sm:p-5">
      <Select label="Mezzo di arrivo" value={value.mode} options={[{ value: "plane", label: "Aereo" }, { value: "train", label: "Treno" }, { value: "bus", label: "Autobus" }, { value: "car", label: "Auto" }]} onChange={(event) => onChange({ mode: event.target.value as Arrival["mode"] })} />
      <div data-arrival-title><MultilingualInput label="Titolo percorso *" data-logistics-path={path("title")} value={value.title} maxLength={160} onChange={(title) => onChange({ title })} /><p className="mt-2 text-xs leading-5 text-[#7a8272]">Il titolo in italiano è obbligatorio. Le altre traduzioni sono facoltative.</p></div>
      <MultilingualTextarea label="Indicazioni per arrivare" data-logistics-path={path("description")} value={value.description} maxLength={4000} onChange={(description) => onChange({ description })} />
      <Input label="Link informazioni sul percorso" data-logistics-path={path("linkUrl")} type="url" placeholder="https://…" value={value.linkUrl} maxLength={2048} onChange={(event) => onChange({ linkUrl: event.target.value })} />
      <button type="button" onClick={onRemove} className="min-h-11 rounded-xl px-3 text-sm font-semibold text-rose-700">Rimuovi percorso</button>
    </div>
  </details>;
}

export function EventLogisticsEditor({ value, onChange }: { value: EventLogistics; onChange: (value: EventLogistics) => void }) {
  return <div className="min-w-0 space-y-6">
    <div><h2 className="text-xl font-semibold text-[#18251f]">Viaggio e soggiorno</h2><p className="mt-2 text-sm leading-6 text-[#7a8272]">Questo passaggio è facoltativo. Aggiungi solo strutture e indicazioni verificate: i campi vuoti non compaiono nella pagina pubblica.</p></div>
    <section className="min-w-0 space-y-3" aria-label="Strutture ricettive">
      <h3 className="font-semibold text-[#263a2c]">Dove soggiornare</h3>
      {!value.accommodations.length && <p className="text-sm text-[#7a8272]">Non hai aggiunto strutture. Puoi continuare senza inserirne.</p>}
      {value.accommodations.map((item, index) => <AccommodationFields key={item.id} value={item} index={index} onChange={(patch) => onChange({ ...value, accommodations: value.accommodations.map((row) => row.id === item.id ? { ...row, ...patch } : row) })} onRemove={() => onChange({ ...value, accommodations: value.accommodations.filter((row) => row.id !== item.id) })} />)}
      <button type="button" disabled={value.accommodations.length >= 12} className={secondaryButton} onClick={() => onChange({ ...value, accommodations: [...value.accommodations, { id: crypto.randomUUID(), kind: "suggested", name: "", address: "", mapUrl: "", bookingUrl: "", phone: "", email: "", distance: blankText(), rate: blankText(), benefits: blankText(), bookingInstructions: blankText(), validUntil: null }] })}>Aggiungi struttura</button>
    </section>
    <section className="min-w-0 space-y-3" aria-label="Percorsi di arrivo">
      <h3 className="font-semibold text-[#263a2c]">Come arrivare</h3>
      {value.arrivals.map((item, index) => <ArrivalFields key={item.id} value={item} index={index} onChange={(patch) => onChange({ ...value, arrivals: value.arrivals.map((row) => row.id === item.id ? { ...row, ...patch } : row) })} onRemove={() => onChange({ ...value, arrivals: value.arrivals.filter((row) => row.id !== item.id) })} />)}
      <button type="button" disabled={value.arrivals.length >= 16} className={secondaryButton} onClick={() => onChange({ ...value, arrivals: [...value.arrivals, { id: crypto.randomUUID(), mode: "train", title: blankText(), description: blankText(), linkUrl: "" }] })}>Aggiungi percorso</button>
    </section>
    <div className={`${cardClass} space-y-5 p-4 sm:p-5`}>
      <MultilingualTextarea label="Accessibilità e necessità specifiche" data-logistics-path="accessibility" value={value.accessibility} maxLength={2000} onChange={(accessibility) => onChange({ ...value, accessibility })} />
      <MultilingualTextarea label="Contatto per viaggio e soggiorno" data-logistics-path="contact" value={value.contact} maxLength={1000} onChange={(contact) => onChange({ ...value, contact })} />
    </div>
  </div>;
}
