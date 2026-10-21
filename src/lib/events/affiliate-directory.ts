import "server-only";
import { requireCommerceStaff } from "@/lib/commerce/admin-auth";
import { getLocalizedText } from "@/lib/i18n-utils";
import { parseEventAffiliates } from "./affiliates";

export type AffiliateDirectoryEvent = { id: string; title: string; startsAt: string };
export type AffiliateDirectoryRow = {
  eventId: string; eventTitle: string; eventStartsAt: string; affiliateId: string; name: string;
  active: boolean; archived: boolean; validCount: number; checkedInCount: number; totalCount: number;
};
export type AffiliateParticipant = {
  id: string; name: string; email: string; packageName: string;
  status: "paid" | "used" | "pending" | "refunded" | "canceled";
  checkedIn: boolean;
  activities: { id: string; name: string; status: string; checkedInAt: string | null; menuChoice: string | null }[];
};
export type AffiliateDirectory = { events: AffiliateDirectoryEvent[]; rows: AffiliateDirectoryRow[]; selectedEventId: string };
export type AffiliateParticipants = {
  event: AffiliateDirectoryEvent; affiliate: { id: string; name: string; active: boolean; archived: boolean };
  participants: AffiliateParticipant[]; validCount: number; checkedInCount: number; totalCount: number;
};

type EventRow = { id: string; titolo: unknown; data_inizio: string; affiliates: unknown };
type Attribution = {
  id: string; event_id: string; affiliate_id: string | null; affiliate_name: string | null; status: string | null; created_at: string | null;
  commerce_entitlements?: { status: string }[];
};
type LegacyParticipant = Attribution & { buyer_nome: string | null; buyer_cognome: string | null; buyer_email: string | null };
type CommerceParticipant = Omit<Attribution, "commerce_entitlements"> & {
  first_name: string; last_name: string; package_name: string;
  commerce_orders: { buyer_email: string } | { buyer_email: string }[] | null;
  commerce_entitlements: { id: string; activity_id: string; activity_name: string; status: string; checked_in_at: string | null; menu_choice: string | null }[];
};
type ContactRow = { pass_id: string; email: string; created_at: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const pageSize = 500;

async function loadRows<T>(query: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>, message: string) {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await query(from, from + pageSize - 1);
    if (error || !data) throw new Error(message);
    rows.push(...data as T[]);
    if (data.length < pageSize) return rows;
  }
}

function eventSummary(event: EventRow, locale: string): AffiliateDirectoryEvent {
  return { id: event.id, title: getLocalizedText(event.titolo, locale) || "Evento", startsAt: event.data_inizio };
}

function valid(record: Attribution, commerce: boolean) {
  return (record.status === "paid" || record.status === "used") && (!commerce || Boolean(record.commerce_entitlements?.some(entry => entry.status === "valid" || entry.status === "used")));
}

function checkedIn(record: Attribution, commerce: boolean) {
  return valid(record, commerce) && (commerce ? Boolean(record.commerce_entitlements?.some(entry => entry.status === "used")) : record.status === "used");
}

function participantStatus(record: Attribution, commerce: boolean): AffiliateParticipant["status"] {
  if (record.status === "refunded" || record.status === "canceled" || record.status === "pending") return record.status;
  if (record.status !== "paid" && record.status !== "used") return "pending";
  if (commerce && record.commerce_entitlements?.length && record.commerce_entitlements.every(entry => entry.status === "used")) return "used";
  return record.status === "used" ? "used" : "paid";
}

/** The directory has counts and public affiliate names, never participant contacts or QR capabilities. */
export async function loadAffiliateDirectory(locale: string, eventFilter?: string): Promise<AffiliateDirectory> {
  const admin = await requireCommerceStaff();
  const selectedEventId = eventFilter?.trim().toLowerCase() || "";
  if (selectedEventId && !uuid.test(selectedEventId)) throw new Error("Evento non disponibile. Seleziona un evento dall’elenco.");
  const eventRows = await loadRows<EventRow>((from, to) => admin.from("events").select("id,titolo,data_inizio,affiliates").order("data_inizio", { ascending: false }).order("id").range(from, to), "Impossibile caricare gli eventi. Riprova.");
  if (selectedEventId && !eventRows.some(event => event.id === selectedEventId)) throw new Error("Evento non disponibile. Seleziona un evento dall’elenco.");
  const events = eventRows.map(event => eventSummary(event, locale));
  const scopedEvents = selectedEventId ? eventRows.filter(event => event.id === selectedEventId) : eventRows;
  if (!scopedEvents.length) return { events, rows: [], selectedEventId };
  const rows = new Map<string, AffiliateDirectoryRow>();
  const eventMap = new Map(scopedEvents.map(event => [event.id, eventSummary(event, locale)]));
  for (const event of scopedEvents) for (const affiliate of parseEventAffiliates(event.affiliates)) {
    const summary = eventMap.get(event.id)!;
    rows.set(`${event.id}:${affiliate.id}`, { eventId: event.id, eventTitle: summary.title, eventStartsAt: summary.startsAt, affiliateId: affiliate.id, name: affiliate.name, active: affiliate.active, archived: false, validCount: 0, checkedInCount: 0, totalCount: 0 });
  }
  const loadAttributions = (table: "tickets" | "commerce_passes") => loadRows<Attribution>((from, to) => {
    let query = admin.from(table).select(`id,event_id,affiliate_id,affiliate_name,status,created_at${table === "commerce_passes" ? ",commerce_entitlements(status)" : ""}`);
    if (selectedEventId) query = query.eq("event_id", selectedEventId);
    return query.order("created_at", { ascending: false }).order("id").range(from, to);
  }, "Impossibile caricare i conteggi degli affiliati. Riprova.");
  const [legacy, commerce] = await Promise.all([loadAttributions("tickets"), loadAttributions("commerce_passes")]);
  const records = [...legacy.map(record => ({ record, commerce: false })), ...commerce.map(record => ({ record, commerce: true }))]
    .sort((a, b) => (b.record.created_at || "").localeCompare(a.record.created_at || ""));
  for (const { record, commerce: isCommerce } of records) {
    const event = eventMap.get(record.event_id);
    if (!event) continue;
    const affiliateId = record.affiliate_id || "direct";
    const key = `${record.event_id}:${affiliateId}`;
    let row = rows.get(key);
    if (!row) {
      row = { eventId: event.id, eventTitle: event.title, eventStartsAt: event.startsAt, affiliateId, name: affiliateId === "direct" ? "Acquisti diretti" : record.affiliate_name || "Affiliato archiviato", active: affiliateId === "direct", archived: affiliateId !== "direct", validCount: 0, checkedInCount: 0, totalCount: 0 };
      rows.set(key, row);
    }
    row.totalCount += 1;
    if (valid(record, isCommerce)) row.validCount += 1;
    if (checkedIn(record, isCommerce)) row.checkedInCount += 1;
  }
  return { events, rows: [...rows.values()].sort((a, b) => b.eventStartsAt.localeCompare(a.eventStartsAt) || a.eventId.localeCompare(b.eventId) || (a.affiliateId === "direct" ? 1 : b.affiliateId === "direct" ? -1 : a.name.localeCompare(b.name, "it"))), selectedEventId };
}

/** Every participant query is bounded by both the event and its affiliate attribution. */
export async function loadAffiliateParticipants(locale: string, eventId: string, affiliateId: string): Promise<AffiliateParticipants | null> {
  const admin = await requireCommerceStaff();
  if (!uuid.test(eventId) || (affiliateId !== "direct" && !uuid.test(affiliateId))) return null;
  eventId = eventId.toLowerCase();
  affiliateId = affiliateId.toLowerCase();
  const { data, error } = await admin.from("events").select("id,titolo,data_inizio,affiliates").eq("id", eventId).maybeSingle();
  if (error) throw new Error("Impossibile caricare l’evento. Riprova.");
  if (!data) return null;
  const event = data as EventRow;
  const [legacy, commerce] = await Promise.all([
    loadRows<LegacyParticipant>((from, to) => {
      let query = admin.from("tickets").select("id,event_id,affiliate_id,affiliate_name,status,created_at,buyer_nome,buyer_cognome,buyer_email").eq("event_id", eventId);
      query = affiliateId === "direct" ? query.is("affiliate_id", null) : query.eq("affiliate_id", affiliateId);
      return query.order("created_at", { ascending: false }).order("id").range(from, to);
    }, "Impossibile caricare gli iscritti dell’affiliato. Riprova."),
    loadRows<CommerceParticipant>((from, to) => {
      let query = admin.from("commerce_passes").select("id,event_id,affiliate_id,affiliate_name,status,created_at,first_name,last_name,package_name,commerce_orders:commerce_orders!commerce_passes_order_id_fkey(buyer_email),commerce_entitlements(id,activity_id,activity_name,status,checked_in_at,menu_choice)").eq("event_id", eventId);
      query = affiliateId === "direct" ? query.is("affiliate_id", null) : query.eq("affiliate_id", affiliateId);
      return query.order("created_at", { ascending: false }).order("id").range(from, to);
    }, "Impossibile caricare gli iscritti dell’affiliato. Riprova."),
  ]);
  const configured = parseEventAffiliates(event.affiliates).find(affiliate => affiliate.id === affiliateId);
  const historical = [...legacy, ...commerce].sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))[0];
  if (!configured && !historical) return null;
  const affiliate = { id: affiliateId, name: affiliateId === "direct" ? "Acquisti diretti" : configured?.name || historical?.affiliate_name || "Affiliato archiviato", active: affiliateId === "direct" || Boolean(configured?.active), archived: affiliateId !== "direct" && !configured };
  const participantEmails = new Map<string, string>();
  const contactBatches = [];
  for (let index = 0; index < commerce.length; index += 100) {
    const ids = commerce.slice(index, index + 100).map(pass => pass.id);
    contactBatches.push(loadRows<ContactRow>((from, to) => admin.from("commerce_attendee_contacts").select("pass_id,email,created_at").in("pass_id", ids).order("created_at", { ascending: false }).order("id").range(from, to), "Impossibile caricare le email dei partecipanti. Riprova."));
  }
  for (const contacts of await Promise.all(contactBatches)) for (const contact of contacts) if (!participantEmails.has(contact.pass_id)) participantEmails.set(contact.pass_id, contact.email);
  const participants: AffiliateParticipant[] = [
    ...legacy.map(record => ({ id: record.id, name: [record.buyer_nome, record.buyer_cognome].filter(Boolean).join(" ") || "Partecipante", email: record.buyer_email || "", packageName: "Ingresso evento", status: participantStatus(record, false), checkedIn: checkedIn(record, false), activities: [] })),
    ...commerce.map(record => {
      const order = Array.isArray(record.commerce_orders) ? record.commerce_orders[0] : record.commerce_orders;
      return { id: record.id, name: [record.first_name, record.last_name].filter(Boolean).join(" ") || "Partecipante", email: participantEmails.get(record.id) || order?.buyer_email || "", packageName: record.package_name, status: participantStatus(record, true), checkedIn: checkedIn(record, true), activities: (record.commerce_entitlements || []).map((entry, index) => ({ id: entry.id || `${record.id}:${entry.activity_id}:${index}`, name: entry.activity_name, status: entry.status, checkedInAt: entry.checked_in_at, menuChoice: entry.menu_choice })) };
    }),
  ].sort((a, b) => a.name.localeCompare(b.name, "it") || a.id.localeCompare(b.id));
  const validCount = legacy.filter(record => valid(record, false)).length + commerce.filter(record => valid(record, true)).length;
  return { event: eventSummary(event, locale), affiliate, participants, validCount, checkedInCount: participants.filter(participant => participant.checkedIn).length, totalCount: participants.length };
}
