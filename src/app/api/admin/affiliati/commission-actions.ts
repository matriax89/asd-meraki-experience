"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCommerceStaff } from "@/lib/commerce/admin-auth";
import { affiliateCommissionRatesSchema, type AffiliateCommissionRates } from "@/lib/events/affiliate-commissions";

const eventIdSchema = z.string().uuid().transform((id) => id.toLowerCase());
type LoadResult = { success: true; rates: AffiliateCommissionRates } | { success: false; error: string };

export async function loadEventAffiliateCommissions(eventId: string): Promise<LoadResult> {
  const db = await requireCommerceStaff();
  const parsed = eventIdSchema.safeParse(eventId);
  if (!parsed.success) return { success: false, error: "Evento non valido." };
  const event = await db.from("events").select("id").eq("id", parsed.data).maybeSingle();
  if (event.error || !event.data) return { success: false, error: "Evento non disponibile." };
  const result = await db.from("event_affiliate_commissions").select("affiliate_id,commission_cents").eq("event_id", parsed.data);
  if (result.error || !result.data) return { success: false, error: "Impossibile caricare i compensi degli affiliati. Riprova." };
  const rates = affiliateCommissionRatesSchema.safeParse(Object.fromEntries(result.data.map((row) => [row.affiliate_id, row.commission_cents])));
  return rates.success ? { success: true, rates: rates.data } : { success: false, error: "I compensi salvati non sono validi. Verifica la configurazione." };
}

export async function saveEventAffiliateCommissions(eventId: string, rates: unknown): Promise<{ success: true } | { success: false; error: string }> {
  const db = await requireCommerceStaff();
  const event = eventIdSchema.safeParse(eventId);
  const parsed = affiliateCommissionRatesSchema.safeParse(rates);
  if (!event.success || !parsed.success) return { success: false, error: "Controlla l’evento e i compensi: inserisci importi validi e non negativi, con al massimo due decimali." };
  const { error } = await db.rpc("set_event_affiliate_commissions", { p_event_id: event.data, p_rates: parsed.data });
  if (error) return { success: false, error: "Compensi non salvati. Ricarica l’evento e verifica che tutti gli affiliati siano già stati salvati." };
  for (const locale of ["it", "en", "de", "es"]) {
    revalidatePath(`/${locale}/admin`);
    revalidatePath(`/${locale}/admin/eventi`);
    revalidatePath(`/${locale}/admin/eventi/${event.data}`);
    revalidatePath(`/${locale}/admin/eventi/${event.data}/statistiche`);
    revalidatePath(`/${locale}/admin/affiliati`, "layout");
  }
  return { success: true };
}
