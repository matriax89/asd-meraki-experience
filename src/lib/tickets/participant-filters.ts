import type { AdminTicket } from "./check-in-types";

export type ParticipantFilters = {
  activity: string;
  formula: string;
  status: string;
  checkIn: string;
  payment: string;
  menu: string;
};

export const EMPTY_PARTICIPANT_FILTERS: ParticipantFilters = { activity: "", formula: "", status: "", checkIn: "", payment: "", menu: "" };
export const LEGACY_ACTIVITY = "__legacy_event";
export const activeParticipantRights = (ticket: AdminTicket) => (ticket.entitlements || []).filter(right => right.status === "valid" || right.status === "used");
export const participantFormula = (ticket: AdminTicket) => ticket.commerce ? ticket.package_name || "Formula non indicata" : "Ingresso evento";
export const participantMenuKey = (activityId: string, menu: string) => `${activityId}::${menu}`;
export const participantPaymentMethods = (ticket: AdminTicket) => ticket.payment_methods?.length ? ticket.payment_methods : [ticket.payment_method || "online"];
export const validParticipant = (ticket: AdminTicket) => (ticket.status === "paid" || ticket.status === "used") && (!ticket.commerce || activeParticipantRights(ticket).length > 0);

/** Revoked admissions never count as attendance, even if they retain a historic timestamp. */
export function participantCheckedIn(ticket: AdminTicket, activityId = "") {
  if (!validParticipant(ticket)) return false;
  return ticket.commerce
    ? activeParticipantRights(ticket).some(right => right.status === "used" && (!activityId || right.activity_id === activityId))
    : (!activityId || activityId === LEGACY_ACTIVITY) && ticket.status === "used";
}

export function matchesParticipantFilters(ticket: AdminTicket, filters: ParticipantFilters) {
  const rights = activeParticipantRights(ticket);
  if (filters.activity && (!validParticipant(ticket) || (filters.activity === LEGACY_ACTIVITY ? ticket.commerce : !rights.some(right => right.activity_id === filters.activity)))) return false;
  if (filters.formula && participantFormula(ticket) !== filters.formula) return false;
  if (filters.status && (filters.status === "valid" ? !validParticipant(ticket) : filters.status === "unknown" ? ticket.status !== null : ticket.status !== filters.status)) return false;
  if (filters.checkIn && (!validParticipant(ticket) || (filters.checkIn === "with") !== participantCheckedIn(ticket, filters.activity))) return false;
  if (filters.payment && !participantPaymentMethods(ticket).includes(filters.payment as "online" | "cash" | "pos")) return false;
  if (filters.menu && (!validParticipant(ticket) || !rights.some(right => right.menu_choice && participantMenuKey(right.activity_id, right.menu_choice) === filters.menu))) return false;
  return true;
}
