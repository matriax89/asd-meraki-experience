"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Eye, LoaderCircle, X } from "lucide-react";
import type { ParticipantRoster, ParticipantRosterRow } from "@/lib/admin/participant-roster-types";
import styles from "./participant-details.module.css";

type Selection = { eventId: string; participantId: string; source: "commerce" | "legacy"; name: string };
type Details = { event: ParticipantRoster["event"]; participant: ParticipantRosterRow };
type Result = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; data: Details };
const statusLabels: Record<string, string> = { paid: "Pagato", used: "Utilizzato", pending: "In attesa", refunded: "Rimborsato", canceled: "Annullato" };
const activityLabels: Record<string, string> = { valid: "Da utilizzare", used: "Check-in registrato", refunded: "Rimborsato", canceled: "Annullato" };
const date = (value: string | null) => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat("it-IT", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Rome" }).format(new Date(value)) : "Non disponibile";

function Fields({ items }: { items: [string, ReactNode][] }) {
  return <dl className={styles.fields}>{items.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "Non disponibile"}</dd></div>)}</dl>;
}

function ParticipantInformation({ data }: { data: Details }) {
  const person = data.participant;
  return <div className={styles.sections}>
    {!person.contactAvailable && <p className={styles.notice}>I dati di questa iscrizione storica sono incompleti. Sono mostrati solo quelli disponibili.</p>}
    {data.event.canceled && <p className={styles.notice}>Evento annullato. Questi dati restano consultabili nello storico.</p>}
    <section aria-label="Dati inseriti all’acquisto"><h3>Dati inseriti all’acquisto</h3><Fields items={[
      ["Nome", person.firstName], ["Cognome", person.lastName], ["Email partecipante", person.email], ["Telefono", person.phone],
      ["Tipo documento", person.documentType === "codice_fiscale" ? "Codice fiscale italiano" : person.documentType === "foreign_id" ? "Documento estero" : person.documentType],
      ["Paese documento", person.documentCountry], [person.documentType === "codice_fiscale" ? "Codice fiscale" : "Numero documento", person.documentNumber],
      ["Data raccolta dati", date(person.contactCreatedAt)],
      ["Preferenza marketing all’iscrizione", person.marketingConsent === null ? "Non disponibile" : person.marketingConsent ? "Sì" : "No"],
      ["Versione informativa privacy", person.privacyVersion],
    ]} /></section>
    <section aria-label="Iscrizione e acquisto"><h3>Iscrizione e acquisto</h3><Fields items={[
      ["Evento", data.event.title], ["Data evento", date(data.event.startsAt)], ["Formula attuale", person.packageName], ["Email acquirente", person.buyerEmail],
      ["Data iscrizione", date(person.createdAt)], ["Affiliato attuale", person.affiliateName || "Acquisti diretti"],
      ["Stato iscrizione", statusLabels[person.status] || "Da verificare"], ["Iscrizione valida", person.valid ? "Sì" : "No"],
      ["Origine iscrizione", person.source === "commerce" ? "Formula evento" : "Biglietto precedente"], ["ID iscrizione", person.id],
    ]} /></section>
    <section aria-label="Attività e check-in"><h3>Attività e check-in</h3><Fields items={[
      ["Con check-in", person.checkedIn ? "Sì" : "No"], ["Primo check-in registrato", date(person.checkedInAt)],
    ]} />{person.activities.length ? <ul className={styles.activities}>{person.activities.map((activity, index) => <li key={`${activity.id}:${index}`}>
      <strong>{activity.name}</strong><span>{activityLabels[activity.status] || "Da verificare"}</span>
      {activity.menuChoice && <span>Menù: {activity.menuChoice}</span>}{activity.checkedInAt && <span>{date(activity.checkedInAt)}</span>}
    </li>)}</ul> : <p className={styles.muted}>Ingresso evento · nessun dettaglio di attività disponibile.</p>}</section>
  </div>;
}

function ParticipantDetailsDialog({ selection, onClose }: { selection: Selection; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result>({ kind: "loading" });

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => { if (element?.open) element.close(); };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ event: selection.eventId, participant: selection.participantId, source: selection.source, locale: "it" });
    async function load() {
      try {
        const response = await fetch(`/api/admin/participants/details?${params}`, { cache: "no-store", credentials: "same-origin", signal: controller.signal });
        const payload = await response.json();
        if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Impossibile caricare i dati. Riprova.");
        if (payload.event?.id !== selection.eventId || payload.participant?.id !== selection.participantId || payload.participant?.source !== selection.source) throw new Error("I dati ricevuti non corrispondono al partecipante selezionato. Riprova.");
        if (!controller.signal.aborted) setResult({ kind: "ready", data: payload });
      } catch (error) {
        if (!controller.signal.aborted) setResult({ kind: "error", message: error instanceof Error ? error.message : "Connessione interrotta. Riprova." });
      }
    }
    void load();
    return () => controller.abort();
  }, [selection.eventId, selection.participantId, selection.source, attempt]);

  return createPortal(<dialog ref={dialog} className={styles.dialog} aria-labelledby={titleId} aria-describedby={descriptionId} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <header className={styles.header}><div><p className={styles.eyebrow}>Dati partecipante</p><h2 id={titleId}>{selection.name || "Partecipante"}</h2><p id={descriptionId} className={styles.muted}>Informazioni di iscrizione e accessi della persona selezionata.</p></div><button type="button" autoFocus className={styles.close} aria-label="Chiudi dati partecipante" onClick={onClose}><X size={20} aria-hidden="true" /></button></header>
    <div className={styles.body} aria-busy={result.kind === "loading"}>
      {result.kind === "loading" ? <p role="status" className={styles.loading}><LoaderCircle className="animate-spin" size={20} aria-hidden="true" />Caricamento dati…</p> : result.kind === "error" ? <div role="alert"><p>{result.message}</p><button className={styles.retry} type="button" onClick={() => { setResult({ kind: "loading" }); setAttempt(current => current + 1); }}>Riprova</button></div> : <ParticipantInformation data={result.data} />}
    </div>
  </dialog>, document.body);
}

export function ParticipantDetailsButton({ eventId, participantId, source, name }: Selection) {
  const [open, setOpen] = useState(false);
  return <><button type="button" className={styles.trigger} title="Visualizza dati partecipante" aria-label={`Visualizza dati di ${name || "questo partecipante"}`} aria-haspopup="dialog" onClick={() => setOpen(true)}><Eye size={18} aria-hidden="true" /></button>{open && <ParticipantDetailsDialog selection={{ eventId, participantId, source, name }} onClose={() => setOpen(false)} />}</>;
}
