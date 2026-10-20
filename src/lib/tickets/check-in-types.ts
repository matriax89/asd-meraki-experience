import type { Database } from "@/types/supabase";

export type TicketStatus = Database["public"]["Enums"]["ticket_status_enum"] | null;

export interface CheckInTicketSummary {
  id: string;
  event_id: string | null;
  buyer_nome: string | null;
  buyer_cognome: string | null;
  status: TicketStatus;
  used_at: string | null;
  commerce?: boolean;
  entitlements?: CheckInEntitlement[];
}

export interface CheckInEntitlement {
  activity_id: string;
  activity_name: string;
  status: "valid" | "used" | "refunded" | "canceled";
  checked_in_at: string | null;
  menu_choice: string | null;
}

export interface AdminTicket extends CheckInTicketSummary {
  buyer_email: string;
  qr_code: string | null;
  events: { titolo: string; data_inizio: string } | null;
  package_name?: string;
  affiliate_id?: string | null;
  affiliate_name?: string | null;
}

export interface CheckInEvent {
  id: string;
  titolo: string;
  data_inizio: string;
  activities?: { id: string; name: string }[];
  affiliates?: { id: string; name: string; active: boolean }[];
}

export type CheckInResult = {
  outcome: "admitted" | "already_used" | "invalid" | "wrong_event" | "unpaid" | "refunded" | "error" | "invalid_activity";
  message: string;
  ticket?: CheckInTicketSummary;
};
