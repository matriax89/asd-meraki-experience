"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { configSchema, parseCommerceConfig } from "@/lib/commerce/config";
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
      admin.from("events").select("id,titolo,commerce_config").eq("id", id).single(),
      allRows((start, end) => admin.from("commerce_orders").select("id,state,amount_cents,quote").eq("event_id", id).order("id").range(start, end)),
      allRows((start, end) => admin.from("commerce_passes").select("id,status").eq("event_id", id).order("id").range(start, end)),
      allRows((start, end) => admin.from("commerce_waitlist").select("id,first_name,last_name,email,activity_ids,status,created_at").eq("event_id", id).order("created_at", { ascending: false }).order("id").range(start, end)),
    ]);
    if (eventResult.error || orderResult.error || passesResult.error || waitlistResult.error) return { success: false as const, error: unavailable };
    const stats = calculateCommerceSalesStats((orderResult.data || []) as Pick<CommerceOrder, "state" | "amount_cents" | "quote">[], (passesResult.data || []) as Pick<CommercePass, "status">[]);
    return { success: true as const, event: eventResult.data, config: parseCommerceConfig(eventResult.data.commerce_config), stats, waitlist: (waitlistResult.data || []) as WaitlistRow[] };
  } catch (error) { return { success: false as const, error: errorMessage(error) }; }
}

export async function saveCommerceAdmin(eventId: string, rawConfig: unknown) {
  try {
    const admin = await requireCommerceStaff();
    const id = idSchema.parse(eventId);
    const parsed = configSchema.safeParse(rawConfig);
    if (!parsed.success) return { success: false as const, error: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(" · ") };
    const { data, error } = await admin.rpc("save_commerce_config", { p_event_id: id, p_config: parsed.data });
    if (error) return { success: false as const, error: error.code === "PGRST202" || error.code === "42703" ? unavailable : error.message };
    if (data && typeof data === "object" && "error" in data) return { success: false as const, error: configErrors[String(data.error)] || "Configurazione non salvata. Ricarica la pagina e riprova." };
    revalidatePath("/[locale]/eventi", "layout"); revalidatePath("/[locale]/workshop", "layout");
    revalidatePath("/[locale]/admin/eventi", "layout");
    return { success: true as const };
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
