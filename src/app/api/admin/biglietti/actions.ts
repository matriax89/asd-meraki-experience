"use server";

import { createAdminClient, createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { CheckInResult } from "@/lib/tickets/check-in-types";
import type { CheckInEntitlement } from "@/lib/tickets/check-in-types";
import type { SupabaseClient } from "@supabase/supabase-js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const codePattern = /^[a-z0-9_-]{1,256}$/i;
const ticketFields = "id,event_id,buyer_nome,buyer_cognome,status,used_at";

async function authorizeCheckIn() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { allowed: false as const, message: "Sessione scaduta. Accedi di nuovo per effettuare il check-in." };

  const admin = createAdminClient();
  const { data: profile, error: roleError } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (roleError || !profile || !["admin", "editor"].includes(profile.role)) {
    return { allowed: false as const, message: "Il tuo account non è autorizzato al check-in." };
  }
  return { allowed: true as const, supabase, admin };
}

/** Read-only preflight: camera access never relies on a cached page or role. */
export async function checkInCameraAccess(): Promise<{ allowed: boolean; message?: string }> {
  try {
    const access = await authorizeCheckIn();
    return access.allowed ? { allowed: true } : { allowed: false, message: access.message };
  } catch {
    return { allowed: false, message: "Impossibile verificare i permessi. Ricarica la pagina con una connessione attiva." };
  }
}

async function checkIn(value: string, eventId: string, column: "id" | "qr_code", activityId?: string): Promise<CheckInResult> {
  if (typeof value !== "string" || typeof eventId !== "string" || !uuidPattern.test(eventId)) {
    return { outcome: "invalid", message: "Seleziona un evento valido e riprova." };
  }

  const code = value.trim();
  if (!(column === "id" ? uuidPattern : codePattern).test(code)) {
    return { outcome: "invalid", message: "Questo codice non è un biglietto Meraki valido." };
  }
  if (activityId !== undefined && activityId !== "" && !/^[a-z0-9_-]{1,64}$/.test(activityId)) return { outcome: "invalid_activity", message: "Seleziona un’attività valida prima della lettura." };
  const selectedActivity = activityId === "__legacy_event" ? undefined : activityId;

  try {
    // Recheck identity and role for every admission, independently of preflight.
    const access = await authorizeCheckIn();
    if (!access.allowed) return { outcome: "error", message: access.message };
    const { supabase, admin } = access;

    // The service-only RPC consumes exactly one activity entitlement under a
    // database lock. Legacy tickets are consulted only when no pass was found.
    const commerceClient = admin as unknown as SupabaseClient;
    const { data: commerce, error: commerceError } = await commerceClient.rpc("check_in_commerce_pass", {
      p_value: code, p_event_id: eventId, p_activity_id: selectedActivity || null, p_column: column,
    });
    if (commerceError && !(commerceError.code === "PGRST202" && !selectedActivity)) return { outcome: "error", message: "Verifica attività non disponibile. Il check-in non è confermato: riprova." };
    if (commerce && commerce.outcome !== "not_found") {
      const pass = commerce.pass as { id: string; event_id: string; first_name: string; last_name: string; status: string } | undefined;
      const entitlements = ((commerce.entitlements || []) as CheckInEntitlement[]).map(({ activity_id, activity_name, status, checked_in_at, menu_choice }) => ({ activity_id, activity_name, status, checked_in_at, menu_choice }));
      const selected = entitlements.find((entry) => entry.activity_id === selectedActivity);
      const ticket = pass ? { id: pass.id, event_id: pass.event_id, buyer_nome: pass.first_name, buyer_cognome: pass.last_name, status: pass.status === "refunded" || pass.status === "canceled" ? "refunded" as const : entitlements.length > 0 && entitlements.every((entry) => entry.status === "used") ? "used" as const : "paid" as const, used_at: selected?.checked_in_at || null, commerce: true, entitlements } : undefined;
      const outcomes: Record<string, CheckInResult["outcome"]> = { success: "admitted", admitted: "admitted", already_used: "already_used", invalid_event: "wrong_event", invalid_activity: "invalid_activity", no_entitlement: "invalid_activity", refunded: "refunded", unpaid: "unpaid" };
      const outcome = outcomes[commerce.outcome] || "error";
      if (outcome === "admitted") revalidatePath("/[locale]/admin/biglietti", "page");
      return { outcome, message: typeof commerce.message === "string" ? commerce.message : "Verifica non completata. Ingresso non autorizzato.", ...(ticket ? { ticket } : {}) };
    }
    if (selectedActivity) return { outcome: "invalid_activity", message: "Questo codice non identifica un accesso all’attività selezionata. Per i biglietti precedenti scegli “Ingresso evento”." };

    // The status is checked while PostgreSQL holds the row lock. Only one
    // operator can change paid -> used, even from different phones.
    const { data: admitted, error: updateError } = await supabase
      .from("tickets")
      .update({ status: "used", used_at: new Date().toISOString() })
      .eq(column, code)
      .eq("event_id", eventId)
      .eq("status", "paid")
      .select(ticketFields)
      .maybeSingle();

    if (updateError) {
      console.error("Ticket check-in failed:", updateError.code);
      return { outcome: "error", message: "Check-in non confermato. Controlla la connessione e riprova: non autorizzare l'ingresso." };
    }

    if (admitted) {
      revalidatePath("/[locale]/admin/biglietti", "page");
      return { outcome: "admitted", message: "Ingresso confermato. Il biglietto è stato utilizzato.", ticket: admitted };
    }

    // A zero-row UPDATE never admits someone. Read only to explain rejection.
    const { data: ticket, error: lookupError } = await supabase
      .from("tickets")
      .select(ticketFields)
      .eq(column, code)
      .maybeSingle();

    if (lookupError) {
      return { outcome: "error", message: "Impossibile verificare il biglietto. Controlla la connessione e riprova." };
    }
    if (!ticket) return { outcome: "invalid", message: "Biglietto non trovato. Ingresso non autorizzato." };
    if (ticket.event_id !== eventId) {
      return { outcome: "wrong_event", message: "Questo biglietto appartiene a un altro evento. Ingresso non autorizzato." };
    }
    if (ticket.status === "used") {
      return { outcome: "already_used", message: "Biglietto già utilizzato. Non autorizzare un secondo ingresso.", ticket };
    }
    if (ticket.status === "refunded") {
      return { outcome: "refunded", message: "Biglietto rimborsato. Ingresso non autorizzato." };
    }
    return { outcome: "unpaid", message: "Pagamento non confermato. Ingresso non autorizzato." };
  } catch {
    return { outcome: "error", message: "Verifica interrotta. Riprova con una connessione attiva: l'ingresso non è confermato." };
  }
}

export async function checkInTicket(ticketId: string, eventId: string, activityId?: string): Promise<CheckInResult> {
  return checkIn(ticketId, eventId, "id", activityId);
}

export async function checkInQrCode(code: string, eventId: string, activityId?: string): Promise<CheckInResult> {
  return checkIn(code, eventId, "qr_code", activityId);
}
