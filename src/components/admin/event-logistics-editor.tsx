"use client";

import { useEffect, useRef, useState } from "react";
import { Input, MultilingualInput, MultilingualTextarea, Select } from "@/components/admin/form-elements";
import type { Accommodation, Arrival, ArrivalConnection, EventLogistics, LocalizedText } from "@/lib/events/logistics";

const blankText = (): LocalizedText => ({ it: "", en: "", de: "", es: "" });
const cardClass = "min-w-0 rounded-2xl border border-[#dedfd4] bg-[#fffefa]";
const secondaryButton = "min-h-11 rounded-xl border border-[#d9ddcf] px-4 text-sm font-semibold text-[#52604f] disabled:opacity-40";
const connectionModes: { value: ArrivalConnection["mode"]; label: string }[] = [
  { value: "bus", label: "Autobus" }, { value: "train", label: "Treno" },
  { value: "shuttle", label: "Navetta" }, { value: "taxi", label: "Taxi" },
  { value: "car", label: "Auto" }, { value: "walk", label: "A piedi" },
  { value: "plane", label: "Aereo" }, { value: "other", label: "Altro mezzo" },
];
const arrivalPointLabels: Record<Arrival["mode"], string> = {
  plane: "Nome aeroporto di arrivo", train: "Stazione di arrivo", bus: "Fermata di arrivo", car: "Punto di arrivo in auto",
};

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
      <MultilingualTextarea richText label={value.kind === "partner" ? "Vantaggi della convenzione" : "Servizi e vantaggi indicati"} data-logistics-path={path("benefits")} value={value.benefits} maxLength={1500} onChange={(benefits) => onChange({ benefits })} />
      <MultilingualTextarea richText label="Come prenotare la struttura" data-logistics-path={path("bookingInstructions")} value={value.bookingInstructions} maxLength={2000} onChange={(bookingInstructions) => onChange({ bookingInstructions })} />
      <button type="button" onClick={onRemove} className="min-h-11 rounded-xl px-3 text-sm font-semibold text-rose-700">Rimuovi struttura</button>
    </div>
  </details>;
}

function ConnectionFields({ value, index, total, path, onChange, onRemove, onMove }: { value: ArrivalConnection; index: number; total: number; path: (field: string) => string; onChange: (patch: Partial<ArrivalConnection>) => void; onRemove: () => void; onMove: (direction: -1 | 1) => void }) {
  const number = index + 1;
  return <section aria-label={`Collegamento ${number}`} data-arrival-connection={value.id} className="min-w-0 rounded-2xl border border-[#dedfd4] bg-white p-4 sm:p-5">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <h5 className="flex items-center gap-2 text-sm font-semibold text-[#263a2c]"><span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#edf0e6] text-xs">{number}</span>Collegamento {number}</h5>
      <div className="flex flex-wrap gap-2">
        <button type="button" aria-label={`Sposta prima il collegamento ${number}`} disabled={index === 0} onClick={() => onMove(-1)} className={`${secondaryButton} px-3`}>↑ <span className="sr-only sm:not-sr-only">Prima</span></button>
        <button type="button" aria-label={`Sposta dopo il collegamento ${number}`} disabled={index === total - 1} onClick={() => onMove(1)} className={`${secondaryButton} px-3`}>↓ <span className="sr-only sm:not-sr-only">Dopo</span></button>
      </div>
    </div>
    <div className="space-y-5">
      <Select label="Mezzo del collegamento" data-logistics-path={path("mode")} value={value.mode} options={connectionModes} onChange={(event) => onChange({ mode: event.target.value as ArrivalConnection["mode"] })} />
      <div className="grid min-w-0 gap-4 xl:grid-cols-2">
        <div data-arrival-connection-required data-connection-field="from"><MultilingualInput label="Da dove parte *" data-logistics-path={path("from")} value={value.from} maxLength={300} onChange={(from) => onChange({ from })} /></div>
        <div data-arrival-connection-required data-connection-field="to"><MultilingualInput label="Dove arriva *" data-logistics-path={path("to")} value={value.to} maxLength={300} onChange={(to) => onChange({ to })} /></div>
        <MultilingualInput label="Linea o operatore" data-logistics-path={path("service")} value={value.service} maxLength={200} placeholder="Es. linea del bus o nome della navetta" onChange={(service) => onChange({ service })} />
        <MultilingualInput label="Durata indicativa" data-logistics-path={path("duration")} value={value.duration} maxLength={120} placeholder="Es. circa 45 minuti" onChange={(duration) => onChange({ duration })} />
      </div>
      <MultilingualTextarea richText label="Indicazioni per il collegamento" data-logistics-path={path("description")} value={value.description} maxLength={2000} onChange={(description) => onChange({ description })} />
      <div className="grid min-w-0 gap-4 xl:grid-cols-2">
        <Input label="Link orari o biglietti" data-logistics-path={path("linkUrl")} type="url" placeholder="https://…" value={value.linkUrl} maxLength={2048} onChange={(event) => onChange({ linkUrl: event.target.value })} />
        <Input label="Link mappa della destinazione" data-logistics-path={path("mapUrl")} type="url" placeholder="https://…" value={value.mapUrl} maxLength={2048} onChange={(event) => onChange({ mapUrl: event.target.value })} />
      </div>
      <button type="button" aria-label={`Rimuovi collegamento ${number}`} onClick={onRemove} className="min-h-11 rounded-xl px-3 text-sm font-semibold text-rose-700">Rimuovi collegamento</button>
    </div>
  </section>;
}

function ArrivalFields({ value, index, onChange, onRemove }: { value: Arrival; index: number; onChange: (patch: Partial<Arrival>) => void; onRemove: () => void }) {
  const [open, setOpen] = useState(!value.title.it);
  const path = (field: string) => `arrivals.${index}.${field}`;
  const connections = value.connections ?? [];
  const updateConnection = (id: string, patch: Partial<ArrivalConnection>) => onChange({ connections: connections.map((connection) => connection.id === id ? { ...connection, ...patch } : connection) });
  const moveConnection = (from: number, direction: -1 | 1) => {
    const to = from + direction;
    if (to < 0 || to >= connections.length) return;
    const reordered = [...connections];
    [reordered[from], reordered[to]] = [reordered[to], reordered[from]];
    onChange({ connections: reordered });
  };
  const addConnection = () => {
    if (connections.length >= 8) return;
    const previousPoint = connections.at(-1)?.to ?? value.arrivalPoint;
    onChange({ connections: [...connections, { id: crypto.randomUUID(), mode: "bus", from: { ...blankText(), ...previousPoint }, to: blankText(), service: blankText(), duration: blankText(), description: blankText(), linkUrl: "", mapUrl: "" }] });
  };
  return <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)} className={cardClass} data-arrival={value.id}>
    <summary className="cursor-pointer break-words p-4 text-sm font-semibold text-[#263a2c] sm:p-5">{value.title.it || `Nuovo percorso ${index + 1}`}</summary>
    <div className="space-y-5 border-t border-[#e4e5dc] p-4 sm:p-5">
      <Select label="Mezzo di arrivo" value={value.mode} options={[{ value: "plane", label: "Aereo" }, { value: "train", label: "Treno" }, { value: "bus", label: "Autobus" }, { value: "car", label: "Auto" }]} onChange={(event) => onChange({ mode: event.target.value as Arrival["mode"] })} />
      <div data-arrival-title><MultilingualInput label="Titolo percorso *" data-logistics-path={path("title")} value={value.title} maxLength={160} onChange={(title) => onChange({ title })} /><p className="mt-2 text-xs leading-5 text-[#7a8272]">Il titolo in italiano è obbligatorio. Le altre traduzioni sono facoltative.</p></div>
      <MultilingualInput label={arrivalPointLabels[value.mode]} data-logistics-path={path("arrivalPoint")} value={value.arrivalPoint ?? blankText()} maxLength={300} onChange={(arrivalPoint) => onChange({ arrivalPoint })} />
      <MultilingualTextarea richText label="Indicazioni per arrivare" data-logistics-path={path("description")} value={value.description} maxLength={4000} onChange={(description) => onChange({ description })} />
      <Input label="Link informazioni sul percorso" data-logistics-path={path("linkUrl")} type="url" placeholder="https://…" value={value.linkUrl} maxLength={2048} onChange={(event) => onChange({ linkUrl: event.target.value })} />
      <section aria-label="Collegamenti successivi" className="min-w-0 space-y-4 rounded-2xl bg-[#f4f5ef] p-3 sm:p-4">
        <div><h4 className="font-semibold text-[#263a2c]">Come proseguire fino all’evento</h4><p className="mt-2 text-sm leading-6 text-[#687360]">Aggiungi i mezzi nell’ordine del viaggio, indicando partenza e arrivo di ogni collegamento. Puoi inserire fino a 8 collegamenti e riordinarli.</p></div>
        {!connections.length && <p className="text-sm leading-6 text-[#687360]">Non hai aggiunto collegamenti. Puoi indicare, ad esempio, il bus dall’aeroporto alla stazione e poi la navetta fino alla sede dell’evento.</p>}
        {connections.map((connection, connectionIndex) => <ConnectionFields key={connection.id} value={connection} index={connectionIndex} total={connections.length} path={(field) => path(`connections.${connectionIndex}.${field}`)} onChange={(patch) => updateConnection(connection.id, patch)} onRemove={() => onChange({ connections: connections.filter((row) => row.id !== connection.id) })} onMove={(direction) => moveConnection(connectionIndex, direction)} />)}
        <p className="text-xs leading-5 text-[#687360]">Per ogni collegamento, partenza e arrivo sono obbligatori in italiano. Le altre traduzioni sono facoltative. La partenza viene copiata dall’arrivo precedente quando aggiungi un collegamento e resta modificabile.</p>
        <button type="button" disabled={connections.length >= 8} className={secondaryButton} onClick={addConnection}>Aggiungi collegamento</button>
      </section>
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
      <MultilingualTextarea richText label="Accessibilità e necessità specifiche" data-logistics-path="accessibility" value={value.accessibility} maxLength={2000} onChange={(accessibility) => onChange({ ...value, accessibility })} />
      <MultilingualTextarea richText label="Contatto per viaggio e soggiorno" data-logistics-path="contact" value={value.contact} maxLength={1000} onChange={(contact) => onChange({ ...value, contact })} />
    </div>
  </div>;
}
