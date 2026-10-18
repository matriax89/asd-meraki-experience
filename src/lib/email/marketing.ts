import { randomBytes } from "node:crypto";
import { commerceClient } from "@/lib/commerce/server";
import { emailLocale } from "./meraki-template";

export async function prepareMarketingEmailLinks(orderId: string, participantIndex: number, locale: string) {
  return prepareLinks("prepare_marketing_consent", { p_order_id: orderId, p_participant_index: participantIndex }, locale);
}

export async function prepareLegacyMarketingEmailLinks(reservationId: string, locale: string) {
  return prepareLinks("prepare_legacy_marketing_consent", { p_reservation_id: reservationId }, locale);
}

async function prepareLinks(rpc: string, identity: Record<string, string | number>, locale: string) {
  try {
    const confirmToken = randomBytes(32).toString("hex");
    const unsubscribeToken = randomBytes(32).toString("hex");
    const { data, error } = await commerceClient().rpc(rpc, {
      ...identity,
      p_confirmation_token: confirmToken, p_unsubscribe_token: unsubscribeToken,
    });
    // Marketing is optional: an unavailable consent service must never stop the ticket.
    if (error || !data || typeof data !== "object" || !("status" in data)) return undefined;
    if (data.status !== "pending" && data.status !== "subscribed") return undefined;
    const origin = new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://www.merakiexperience.org").origin;
    const preferenceUrl = (token: string) => `${origin}/${emailLocale(locale)}/profilo/preferenze?token=${token}`;
    return {
      ...(data.status === "pending" ? { confirmUrl: preferenceUrl(confirmToken) } : {}),
      unsubscribeUrl: preferenceUrl(unsubscribeToken),
    };
  } catch { return undefined; }
}

export type MarketingContact = {
  email: string; first_name: string; last_name: string; locale: string; confirmed_at: string | null;
};

/** Defend CSV imports against spreadsheet formulas without exporting private identity data. */
export function marketingContactsCsv(contacts: MarketingContact[]) {
  const cell = (value: string) => `"${(/^[\s]*[=+\-@\t\r]/.test(value) ? `'${value}` : value).replaceAll('"', '""')}"`;
  return "\uFEFF" + [["email", "first_name", "last_name", "locale", "confirmed_at"],
    ...contacts.map((contact) => [contact.email, contact.first_name, contact.last_name, contact.locale, contact.confirmed_at || ""]),
  ].map((row) => row.map(cell).join(",")).join("\r\n");
}
