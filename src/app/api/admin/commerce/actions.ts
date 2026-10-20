"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { configSchema, parseCommerceConfig } from "@/lib/commerce/config";
import { discountSchema, type CommerceDiscountCode } from "@/lib/commerce/discounts";
import { requireCommerceStaff } from "@/lib/commerce/admin-auth";
import type { WaitlistRow } from "@/lib/commerce/admin-types";

import { calculateCommerceSalesStats } from "@/lib/commerce/sales-stats";
import type { CommerceOrder, CommercePass } from "@/lib/commerce/types";

const idSchema = z.string().uuid();
const unavailable = "Vendite avanzate non disponibili: applica prima la migrazione commerce al database.";
const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Operazione non completata. Riprova.";
const configErrors: Record<string, string> = {
  event_unavailable: "Evento non disponibile. Ricarica la pagina.",
  invalid_config: "La configurazione non è valida. Controlla attività, prezzi e intervalli.",
  legacy_checkouts_pending: "Sono in corso acquisti con la modalità precedente. Attendi che siano completati o scaduti prima di attivare le formule.",
  active_checkouts: "Sono in corso acquisti: puoi cambiare i prezzi, ma attendi la chiusura delle prenotazioni per modificare attività, formule e aggiunte.",
  issued_activity_removed: "Non puoi rimuovere un’attività che ha accessi già venduti.",
  capacity_below_occupancy: "I posti totali non possono essere inferiori ai posti già venduti o riservati.",
  issued_package_removed: "Non puoi rimuovere una formula già acquistata mentre gli upgrade sono attivi.",
  issued_package_changed: "Le attività di una formula già acquistata devono restare le stesse mentre gli upgrade sono attivi.",
};

async function allRows<T>(getPage: (start: number, end: number) => PromiseLike<{ data: T[] | null; error: { code?: string; message?: string } | null }>) {
  const data: T[] = [];
  for (let start = 0; ; start += 500) {
    const page = await getPage(start, start + 499);
    if (page.error) return { data: null, error: page.error };
    data.push(...page.data || []);
    if (!page.data || page.data.length < 500) return { data, error: null };
  }
}

export async function loadCommerceAdmin(eventId: string) {
  try {
    const admin = await requireCommerceStaff();
    const id = idSchema.parse(eventId);
    const [eventResult, orderResult, passesResult, waitlistResult] = await Promise.all([
      admin.from("events").select("id,titolo,slug,tipo,attivo,data_inizio,commerce_config").eq("id", id).single(),
      allRows((start, end) => admin.from("commerce_orders").select("id,state,amount_cents,quote").eq("event_id", id).order("id").range(start, end)),
      allRows((start, end) => admin.from("commerce_passes").select("id,status").eq("event_id", id).order("id").range(start, end)),
      allRows((start, end) => admin.from("commerce_waitlist").select("id,first_name,last_name,email,activity_ids,status,created_at").eq("event_id", id).order("created_at", { ascending: false }).order("id").range(start, end)),
    ]);
    if (eventResult.error || orderResult.error || passesResult.error || waitlistResult.error) return { success: false as const, error: unavailable };
    const stats = calculateCommerceSalesStats((orderResult.data || []) as Pick<CommerceOrder, "state" | "amount_cents" | "quote">[], (passesResult.data || []) as Pick<CommercePass, "status">[]);
    return { success: true as const, event: eventResult.data, config: parseCommerceConfig(eventResult.data.commerce_config), stats, waitlist: (waitlistResult.data || []) as WaitlistRow[] };
  } catch (error) { return { success: false as const, error: errorMessage(error) }; }
}

export async function saveCommerceAdmin(eventId: string, rawConfig: unknown, options?: { publish?: boolean }) {
  try {
    const admin = await requireCommerceStaff();
    const id = idSchema.parse(eventId);
    const parsed = configSchema.safeParse(rawConfig);
    if (!parsed.success) return { success: false as const, error: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(" · ") };
    const intent = z.object({ publish: z.boolean().optional() }).strict().parse(options || {});
    if (intent.publish && !parsed.data.enabled) return { success: false as const, error: "Attiva le formule e completa almeno un’attività e una formula prima di pubblicare." };
    const { data, error } = await admin.rpc("save_commerce_config", { p_event_id: id, p_config: parsed.data });
    if (error) return { success: false as const, error: error.code === "PGRST202" || error.code === "42703" ? unavailable : error.message };
    if (data && typeof data === "object" && "error" in data) return { success: false as const, error: configErrors[String(data.error)] || "Configurazione non salvata. Ricarica la pagina e riprova." };
    if (intent.publish) {
      if (!data || typeof data !== "object" || !("saved" in data) || data.saved !== true) return { success: false as const, error: "Il salvataggio delle formule non è confermato. L’evento non è stato pubblicato: ricarica e riprova." };
      // Publish only the validated configuration just saved by the existing transaction.
      // The version check also prevents a concurrent editor from publishing other changes.
      const current = await admin.from("events").select("commerce_config,updated_at").eq("id", id).single();
      const savedConfig = parseCommerceConfig(current.data?.commerce_config);
      if (current.error || !current.data?.updated_at || !savedConfig?.enabled || JSON.stringify(savedConfig) !== JSON.stringify(parsed.data)) {
        return { success: false as const, error: "Configurazione salvata, ma la pubblicazione non è confermata. L’evento è stato modificato: ricarica e controlla i dati prima di pubblicare." };
      }
      const published = await admin.from("events").update({ attivo: true, updated_at: new Date().toISOString() })
        .eq("id", id).eq("updated_at", current.data.updated_at).select("id").maybeSingle();
      if (published.error || !published.data) return { success: false as const, error: "Configurazione salvata, ma l’evento non è stato pubblicato. Ricarica e riprova." };
    }
    revalidatePath("/[locale]/eventi", "layout"); revalidatePath("/[locale]/workshop", "layout");
    revalidatePath("/[locale]/admin/eventi", "layout");
    revalidatePath("/[locale]", "layout");
    return { success: true as const, published: Boolean(intent.publish) };
  } catch (error) { return { success: false as const, error: errorMessage(error) }; }
}

export async function updateCommerceWaitlist(eventId: string, entryId: string, status: "waiting" | "notified" | "removed") {
  try {
    const admin = await requireCommerceStaff();
    const event = idSchema.parse(eventId); const entry = idSchema.parse(entryId);
    const nextStatus = z.enum(["waiting", "notified", "removed"]).parse(status);
    const { data, error } = await admin.from("commerce_waitlist").update({ status: nextStatus }).eq("id", entry).eq("event_id", event).select("id").maybeSingle();
    if (error || !data) return { success: false as const, error: "Voce non aggiornata. Ricarica e riprova." };
    revalidatePath("/[locale]/admin/eventi", "layout");
    return { success: true as const };
  } catch (error) { return { success: false as const, error: errorMessage(error) }; }
}


const discountErrors: Record<string, string> = {
  event_unavailable: "Evento non disponibile. Ricarica la pagina.",
  invalid_discount: "Controlla codice, importo, date e prodotti della promozione.",
  discount_code_exists: "Questo codice esiste già per l’evento. Modifica quello esistente oppure scegli un altro codice.",
  invalid_discount_target: "Uno dei prodotti o degli scaglioni selezionati non è disponibile. Salva prima le formule e ricarica la pagina.",
  discount_not_found: "Codice non trovato per questo evento. Ricarica la pagina.",
  discount_limit_below_usage: "Il limite non può essere inferiore agli utilizzi già confermati o riservati.",
};
export async function loadCommerceDiscountsAdmin(eventId: string) {
  try {
    const admin = await requireCommerceStaff();
    const id = idSchema.parse(eventId);
    const { data, error } = await admin.rpc("event_discount_code_stats", { p_event_id: id });
    if (error || !data || typeof data !== "object" || !("discounts" in data) || !Array.isArray(data.discounts)) return { success: false as const, error: "Codici sconto non disponibili. Verifica che la migrazione degli sconti sia stata applicata al database." };
    return { success: true as const, discounts: data.discounts as CommerceDiscountCode[] };
  } catch (error) { return { success: false as const, error: errorMessage(error) }; }
}
export async function saveCommerceDiscountAdmin(eventId: string, rawDiscount: unknown) {
  try {
    const admin = await requireCommerceStaff();
    const id = idSchema.parse(eventId);
    const parsed = discountSchema.safeParse(rawDiscount);
    if (!parsed.success) return { success: false as const, error: parsed.error.issues.map((issue) => issue.message).join(" · ") };
    const { data, error } = await admin.rpc("save_event_discount_code", { p_event_id: id, p_discount: parsed.data });
    if (error) return { success: false as const, error: error.code === "PGRST202" || error.code === "42703" ? "Codici sconto non disponibili: applica prima la migrazione degli sconti." : error.code === "23505" ? discountErrors.discount_code_exists : "Codice non salvato. Ricarica e riprova." };
    if (!data || typeof data !== "object" || "error" in data || !("discount" in data) || !data.discount) return { success: false as const, error: data && typeof data === "object" && "error" in data ? discountErrors[String(data.error)] || "Codice non salvato. Controlla i prodotti selezionati e riprova." : "Salvataggio non confermato. Ricarica e riprova." };
    revalidatePath("/[locale]/admin/eventi", "layout");
    return { success: true as const, discount: data.discount as CommerceDiscountCode };
  } catch (error) { return { success: false as const, error: errorMessage(error) }; }
}
