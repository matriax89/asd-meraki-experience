import type { ParticipantRoster } from "./participant-roster-types";

const registrationStatus: Record<string, string> = { paid: "Pagato", used: "Utilizzato", pending: "In attesa", refunded: "Rimborsato", canceled: "Annullato" };
const activityStatus: Record<string, string> = { valid: "Da utilizzare", used: "Check-in registrato", refunded: "Rimborsato", canceled: "Annullato" };
const documentType: Record<string, string> = { codice_fiscale: "Codice fiscale", foreign_id: "Documento estero" };
const yesNo = (value: boolean) => value ? "Sì" : "No";
const date = (value: string | null) => value && Number.isFinite(Date.parse(value))
  ? new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value))
  : "";

/** Explicit staff download: only registration data, without payment or QR capabilities. */
export function participantRosterCsv(roster: ParticipantRoster): string {
  const columns = ["Evento", "Data evento (ora italiana)", "Evento annullato", "Affiliato", "Nome", "Cognome", "Email partecipante", "Telefono", "Email acquirente", "Contatto partecipante disponibile", "Tipo documento", "Paese documento", "Codice fiscale / numero documento", "Formula attuale", "Stato iscrizione", "Iscrizione valida", "Registrato il (ora italiana)", "Con check-in", "Primo check-in (ora italiana)", "Attività attive", "Dettaglio attività e stati", "Workshop", "Masterclass", "Cena", "Menù cena", "Check-in per attività (ora italiana)", "Consenso marketing all’iscrizione", "Versione informativa privacy", "Dati contatto registrati il (ora italiana)", "Origine iscrizione", "ID iscrizione"];
  // A text marker preserves document identifiers such as leading-zero, long numeric or date-like values in spreadsheet applications.
  const rows = roster.participants.map(person => {
    const active = person.activities.filter(activity => activity.status === "valid" || activity.status === "used");
    const ofKind = (kind: string) => person.activities.filter(activity => activity.kind === kind);
    const describe = (activities: typeof person.activities) => activities.map(activity => `${activity.name}: ${activityStatus[activity.status] || activity.status}`).join(" | ");
    return [roster.event.title, date(roster.event.startsAt), yesNo(roster.event.canceled), person.affiliateName || "Acquisti diretti", person.firstName, person.lastName, person.email, person.phone, person.buyerEmail, yesNo(person.contactAvailable), documentType[person.documentType] || person.documentType, person.documentCountry, person.documentNumber ? `'${person.documentNumber}` : person.maskedDocument, person.packageName, registrationStatus[person.status] || person.status, yesNo(person.valid), date(person.createdAt), yesNo(person.checkedIn), date(person.checkedInAt), active.map(activity => activity.name).join(" | "), describe(person.activities), describe(ofKind("workshop")), describe(ofKind("masterclass")), describe(ofKind("dinner")), ofKind("dinner").filter(activity => activity.menuChoice).map(activity => `${activity.name}: ${activity.menuChoice}`).join(" | "), person.activities.filter(activity => activity.checkedInAt).map(activity => `${activity.name}: ${date(activity.checkedInAt)}`).join(" | "), person.marketingConsent === null ? "Non disponibile" : yesNo(person.marketingConsent), person.privacyVersion, date(person.contactCreatedAt), person.source === "commerce" ? "Formula evento" : "Biglietto precedente", person.id];
  });
  const cell = (value: string) => {
    // Spreadsheet applications can execute formulas even in quoted CSV cells.
    const safe = (/^[\s\u0000-\u001f]*[=+\-@]/.test(value) || /^(?:0\d+|\d{16,})$/.test(value)) ? `'${value}` : value;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  return "\uFEFF" + [columns, ...rows].map(row => row.map(cell).join(";")).join("\r\n") + "\r\n";
}

export function participantRosterFilename(roster: ParticipantRoster, onlyValid = false): string {
  const slug = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70);
  return `meraki-partecipanti-${slug(roster.event.title) || roster.event.id}-${roster.affiliate ? slug(roster.affiliate.name) || roster.affiliate.id : "tutti-affiliati"}${onlyValid ? "-validi" : "-completo"}.csv`;
}
