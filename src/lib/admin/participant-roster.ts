import "server-only";
import { requireCommerceStaff } from "@/lib/commerce/admin-auth";
import { getLocalizedText } from "@/lib/i18n-utils";
import { parseEventAffiliates } from "@/lib/events/affiliates";
import type { ParticipantDetails, ParticipantDetailsInput, ParticipantRoster, ParticipantRosterActivity, ParticipantRosterInput, ParticipantRosterRow } from "./participant-roster-types";

export class ParticipantRosterError extends Error {
  constructor(public readonly status: 400 | 403 | 404 | 503, message: string) {
    super(message);
    this.name = "ParticipantRosterError";
  }
}

type EventRow = { id: string; titolo: unknown; data_inizio: string; canceled_at: string | null; affiliates: unknown; commerce_config: unknown };
type Attribution = { id: string; event_id: string; affiliate_id: string | null; affiliate_name: string | null; status: string | null; created_at: string | null };
type Entitlement = { activity_id: string; activity_name: string; kind?: string | null; status: string; checked_in_at: string | null; menu_choice: string | null };
type PassRow = Attribution & { order_id: string; participant_index: number | null; first_name: string; last_name: string; package_name: string; package_activity_ids: string[]; commerce_entitlements: Entitlement[] | null };
type TicketRow = Attribution & { buyer_nome: string | null; buyer_cognome: string | null; buyer_email: string | null; buyer_telefono: string | null; used_at: string | null };
type ContactRow = {
  pass_id?: string; ticket_id?: string; order_id?: string; reservation_id?: string; participant_index?: number;
  first_name: string; last_name: string; email: string; phone: string;
  document_type: string; document_country: string; document_number: string; privacy_version: string; created_at: string;
};
type OrderRow = { id: string; buyer_email: string | null; created_at: string | null; attendees: unknown; attendee_privacy_version: string | null };
type ReservationRow = { id: string; attendee: unknown; attendee_privacy_version: string | null; created_at: string | null };
type Attendee = { firstName?: unknown; lastName?: unknown; email?: unknown; phone?: unknown; documentType?: unknown; documentCountry?: unknown; documentNumber?: unknown; marketingConsent?: unknown };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (value: unknown): string => typeof value === "string" ? value : "";
const nullableText = (value: unknown): string | null => typeof value === "string" && value ? value : null;
const active = (status: string) => status === "valid" || status === "used";
const pageSize = 500;
const batchSize = 100;

async function requireRosterStaff() {
  try { return await requireCommerceStaff(); }
  catch { throw new ParticipantRosterError(403, "Accedi con un account autorizzato per consultare gli iscritti."); }
}

async function loadRows<T>(query: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>, label: string): Promise<T[]> {
  const result: T[] = [];
  try {
    for (let from = 0; ; from += pageSize) {
      const response = await query(from, from + pageSize - 1);
      if (response.error || !response.data) throw new Error("unavailable");
      result.push(...response.data as T[]);
      if (response.data.length < pageSize) return result;
    }
  } catch {
    throw new ParticipantRosterError(503, `Impossibile caricare ${label}. Riprova.`);
  }
}

async function batchedRows<T>(ids: string[], query: (ids: string[], from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>, label: string): Promise<T[]> {
  const unique = [...new Set(ids)];
  const batches: Promise<T[]>[] = [];
  for (let index = 0; index < unique.length; index += batchSize) {
    const batch = unique.slice(index, index + batchSize);
    batches.push(loadRows<T>((from, to) => query(batch, from, to), label));
  }
  return (await Promise.all(batches)).flat();
}

function attendee(value: unknown): Attendee | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Attendee : null;
}

function indexedAttendee(order: OrderRow | undefined, index: unknown): Attendee | null {
  if (!order || !Array.isArray(order.attendees) || !Number.isSafeInteger(index) || (index as number) < 0) return null;
  return attendee(order.attendees[index as number]);
}

function contactDetails(contact: ContactRow | undefined, snapshot: Attendee | null, privacyVersion: string | null | undefined, includeDocuments: boolean) {
  const documentNumber = contact ? text(contact.document_number) : text(snapshot?.documentNumber);
  const visibleTail = documentNumber.length > 4 ? documentNumber.slice(-4) : "";
  return {
    email: contact ? text(contact.email) : text(snapshot?.email),
    phone: contact ? text(contact.phone) : text(snapshot?.phone),
    documentType: contact ? text(contact.document_type) : text(snapshot?.documentType),
    documentCountry: contact ? text(contact.document_country) : text(snapshot?.documentCountry),
    documentNumber: includeDocuments ? documentNumber : "",
    maskedDocument: documentNumber ? `${"•".repeat(documentNumber.length - visibleTail.length)}${visibleTail}` : "",
    privacyVersion: contact ? text(contact.privacy_version) : text(privacyVersion),
    contactCreatedAt: nullableText(contact?.created_at),
    contactAvailable: Boolean(contact || snapshot),
    marketingConsent: typeof snapshot?.marketingConsent === "boolean" ? snapshot.marketingConsent : null,
  };
}

function status(value: string | null): ParticipantRosterRow["status"] {
  return value === "paid" || value === "used" || value === "refunded" || value === "canceled" ? value : "pending";
}

/** The event chooser reads event labels only, never participant or contact records. */
export async function loadParticipantRosterEvents(locale: string): Promise<{ id: string; title: string; startsAt: string }[]> {
  const admin = await requireRosterStaff();
  const events = await loadRows<Pick<EventRow, "id" | "titolo" | "data_inizio">>((from, to) => admin.from("events").select("id,titolo,data_inizio").order("data_inizio", { ascending: false }).order("id").range(from, to), "gli eventi");
  return events.map(event => ({ id: event.id, title: getLocalizedText(event.titolo, locale) || "Evento", startsAt: event.data_inizio }));
}

/** Staff-only roster. Contact and order records never escape these explicit DTOs. */
export async function loadParticipantRoster(input: ParticipantRosterInput): Promise<ParticipantRoster> {
  const admin = await requireRosterStaff();
  const eventId = text(input.eventId).trim().toLowerCase();
  const affiliateFilter = text(input.affiliateId).trim().toLowerCase();
  const affiliateId = !affiliateFilter || affiliateFilter === "all" ? null : affiliateFilter;
  const singleParticipant = input.participantId !== undefined || input.source !== undefined;
  const participantId = text(input.participantId).trim().toLowerCase();
  const source = text(input.source);
  if (!uuid.test(eventId) || affiliateId && affiliateId !== "direct" && !uuid.test(affiliateId)) throw new ParticipantRosterError(400, "Seleziona un evento e un affiliato validi.");
  if (singleParticipant && (!uuid.test(participantId) || !["commerce", "legacy"].includes(source) || !["it", "en", "de", "es"].includes(input.locale))) throw new ParticipantRosterError(400, "Seleziona un partecipante valido.");
  let event: EventRow;
  try {
    const response = await admin.from("events").select("id,titolo,data_inizio,canceled_at,affiliates,commerce_config").eq("id", eventId).maybeSingle();
    if (response.error) throw new Error("unavailable");
    if (!response.data) throw new ParticipantRosterError(404, "Evento non disponibile.");
    event = response.data as EventRow;
  } catch (error) {
    if (error instanceof ParticipantRosterError) throw error;
    throw new ParticipantRosterError(503, "Impossibile caricare l’evento. Riprova.");
  }
  const [passes, tickets] = await Promise.all([
    source === "legacy" ? Promise.resolve([] as PassRow[]) : loadRows<PassRow>((from, to) => {
      let query = admin.from("commerce_passes").select("id,event_id,order_id,participant_index,first_name,last_name,package_name,package_activity_ids,status,created_at,affiliate_id,affiliate_name,commerce_entitlements(activity_id,activity_name,kind,status,checked_in_at,menu_choice)").eq("event_id", eventId);
      if (singleParticipant) query = query.eq("id", participantId);
      if (affiliateId) query = affiliateId === "direct" ? query.is("affiliate_id", null) : query.eq("affiliate_id", affiliateId);
      return query.order("created_at", { ascending: false }).order("id").range(from, to);
    }, "i partecipanti"),
    source === "commerce" ? Promise.resolve([] as TicketRow[]) : loadRows<TicketRow>((from, to) => {
      let query = admin.from("tickets").select("id,event_id,buyer_nome,buyer_cognome,buyer_email,buyer_telefono,status,used_at,created_at,affiliate_id,affiliate_name").eq("event_id", eventId);
      if (singleParticipant) query = query.eq("id", participantId);
      if (affiliateId) query = affiliateId === "direct" ? query.is("affiliate_id", null) : query.eq("affiliate_id", affiliateId);
      return query.order("created_at", { ascending: false }).order("id").range(from, to);
    }, "i biglietti precedenti"),
  ]);
  if (singleParticipant && !passes.length && !tickets.length) throw new ParticipantRosterError(404, "Partecipante non disponibile per questo evento.");
  const configured = parseEventAffiliates(event.affiliates);
  const configuredAffiliate = configured.find(entry => entry.id === affiliateId);
  const historical = [...passes, ...tickets].sort((a, b) => text(b.created_at).localeCompare(text(a.created_at)) || a.id.localeCompare(b.id))[0];
  if (affiliateId && affiliateId !== "direct" && !configuredAffiliate && !historical) throw new ParticipantRosterError(404, "Affiliato non disponibile per questo evento.");
  const contactFields = "first_name,last_name,email,phone,document_type,document_country,document_number,privacy_version,created_at";
  const [commerceContacts, legacyContacts] = await Promise.all([
    batchedRows<ContactRow>(passes.map(pass => pass.id), (ids, from, to) => admin.from("commerce_attendee_contacts").select(`pass_id,order_id,participant_index,${contactFields}`).in("pass_id", ids).order("created_at", { ascending: false }).order("id").range(from, to), "i dati di registrazione dei partecipanti"),
    batchedRows<ContactRow>(tickets.map(ticket => ticket.id), (ids, from, to) => admin.from("legacy_ticket_attendee_contacts").select(`ticket_id,reservation_id,${contactFields}`).in("ticket_id", ids).order("created_at", { ascending: false }).order("ticket_id").range(from, to), "i dati di registrazione dei biglietti precedenti"),
  ]);
  const passIds = new Set(passes.map(pass => pass.id));
  const ticketIds = new Set(tickets.map(ticket => ticket.id));
  const contactByPass = new Map<string, ContactRow>();
  const contactByTicket = new Map<string, ContactRow>();
  for (const contact of commerceContacts) if (contact.pass_id && passIds.has(contact.pass_id) && !contactByPass.has(contact.pass_id)) contactByPass.set(contact.pass_id, contact);
  for (const contact of legacyContacts) if (contact.ticket_id && ticketIds.has(contact.ticket_id) && !contactByTicket.has(contact.ticket_id)) contactByTicket.set(contact.ticket_id, contact);
  const [orders, reservations] = await Promise.all([
    batchedRows<OrderRow>([...passes.map(pass => pass.order_id), ...[...contactByPass.values()].flatMap(contact => contact.order_id ? [contact.order_id] : [])], (ids, from, to) => admin.from("commerce_orders").select("id,buyer_email,created_at,attendees,attendee_privacy_version").eq("event_id", eventId).in("id", ids).order("id").range(from, to), "i dati degli acquisti"),
    batchedRows<ReservationRow>([...contactByTicket.values()].flatMap(contact => contact.reservation_id ? [contact.reservation_id] : []), (ids, from, to) => admin.from("ticket_reservations").select("id,attendee,attendee_privacy_version,created_at").eq("event_id", eventId).in("id", ids).order("id").range(from, to), "i dati delle prenotazioni precedenti"),
  ]);
  const orderById = new Map(orders.map(order => [order.id, order]));
  const reservationById = new Map(reservations.map(reservation => [reservation.id, reservation]));
  const activityKinds = new Map<string, string>();
  const config = event.commerce_config;
  if (config && typeof config === "object" && "activities" in config && Array.isArray(config.activities)) for (const activity of config.activities) {
    if (activity && typeof activity === "object" && typeof activity.id === "string" && typeof activity.kind === "string") activityKinds.set(activity.id, activity.kind);
  }
  const affiliateName = (record: Attribution) => !record.affiliate_id ? "Acquisti diretti" : configured.find(entry => entry.id === record.affiliate_id)?.name || record.affiliate_name || "Affiliato archiviato";
  const participants: ParticipantRosterRow[] = [
    ...passes.map((pass): ParticipantRosterRow => {
      const original = orderById.get(pass.order_id);
      const contact = contactByPass.get(pass.id);
      const contactOrder = contact?.order_id ? orderById.get(contact.order_id) : original;
      const snapshot = indexedAttendee(contactOrder, contact ? contact.participant_index : pass.participant_index);
      const activities: ParticipantRosterActivity[] = (pass.commerce_entitlements || []).map(entry => ({ id: text(entry.activity_id), name: text(entry.activity_name), kind: text(entry.kind) || activityKinds.get(entry.activity_id) || "", status: text(entry.status), checkedInAt: nullableText(entry.checked_in_at), menuChoice: nullableText(entry.menu_choice) }));
      const current = activities.filter(entry => active(entry.status));
      const valid = !event.canceled_at && pass.status === "paid" && current.length > 0;
      const used = current.filter(entry => entry.status === "used");
      const checkedInAt = valid ? used.map(entry => entry.checkedInAt).filter((value): value is string => Boolean(value)).sort()[0] || null : null;
      const partial = valid && Array.isArray(pass.package_activity_ids) && pass.package_activity_ids.some(id => !current.some(entry => entry.id === id));
      return {
        id: pass.id, source: "commerce", firstName: text(pass.first_name), lastName: text(pass.last_name),
        ...contactDetails(contact, snapshot, contactOrder?.attendee_privacy_version, input.includeDocuments === true), buyerEmail: text(original?.buyer_email),
        packageName: partial ? `Accessi parziali: ${current.filter(entry => entry.kind !== "dinner").map(entry => entry.name).join(" + ") || "solo cena"}` : text(pass.package_name),
        status: pass.status === "paid" && current.length > 0 && current.every(entry => entry.status === "used") ? "used" : status(pass.status),
        valid, checkedIn: valid && used.length > 0, checkedInAt, createdAt: nullableText(original?.created_at) || nullableText(pass.created_at),
        affiliateId: pass.affiliate_id || null, affiliateName: affiliateName(pass), activities,
      };
    }),
    ...tickets.map((ticket): ParticipantRosterRow => {
      const contact = contactByTicket.get(ticket.id);
      const reservation = contact?.reservation_id ? reservationById.get(contact.reservation_id) : undefined;
      const snapshot = attendee(reservation?.attendee);
      const valid = !event.canceled_at && (ticket.status === "paid" || ticket.status === "used");
      const details = contactDetails(contact, snapshot, reservation?.attendee_privacy_version, input.includeDocuments === true);
      return {
        id: ticket.id, source: "legacy", firstName: text(contact?.first_name) || text(ticket.buyer_nome), lastName: text(contact?.last_name) || text(ticket.buyer_cognome),
        ...details, phone: details.phone || text(ticket.buyer_telefono), buyerEmail: text(ticket.buyer_email), packageName: "Ingresso evento", status: status(ticket.status),
        valid, checkedIn: valid && ticket.status === "used", checkedInAt: nullableText(ticket.used_at),
        createdAt: nullableText(reservation?.created_at) || nullableText(ticket.created_at), affiliateId: ticket.affiliate_id || null, affiliateName: affiliateName(ticket), activities: [],
      };
    }),
  ].sort((a, b) => a.lastName.localeCompare(b.lastName, "it") || a.firstName.localeCompare(b.firstName, "it") || a.id.localeCompare(b.id) || a.source.localeCompare(b.source));
  return {
    event: { id: event.id, title: getLocalizedText(event.titolo, input.locale) || "Evento", startsAt: event.data_inizio, canceled: Boolean(event.canceled_at) },
    affiliate: affiliateId ? { id: affiliateId, name: affiliateId === "direct" ? "Acquisti diretti" : configuredAffiliate?.name || historical?.affiliate_name || "Affiliato archiviato" } : null,
    participants,
  };
}

/** Full registration details are read only after an explicit staff request for one person. */
export async function loadParticipantDetails(input: ParticipantDetailsInput): Promise<ParticipantDetails> {
  const roster = await loadParticipantRoster({ locale: input.locale, eventId: input.eventId, participantId: text(input.participantId), source: text(input.source), includeDocuments: true });
  const participant = roster.participants[0];
  if (!participant) throw new ParticipantRosterError(404, "Partecipante non disponibile per questo evento.");
  return { event: roster.event, participant };
}
