"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCommerceStaff } from "@/lib/commerce/admin-auth";
import { createClient } from "@/lib/supabase/server";
import { eventAffiliatesSchema } from "@/lib/events/affiliates";

const identifier = z.string().uuid().transform(value => value.toLowerCase());
const requestSchema = z.object({
  source: z.enum(["legacy", "commerce"]), id: identifier, eventId: identifier,
  affiliateId: identifier.nullable(), expectedAffiliateId: identifier.nullable(),
}).strict();
const participantSchema = requestSchema.omit({ expectedAffiliateId: true }).extend({
  affiliateName: z.string().trim().min(1).max(120).nullable(),
}).refine(row => (row.affiliateId === null) === (row.affiliateName === null));
const resultSchema = z.object({ changed: z.boolean(), participant: participantSchema });
const optionSchema = z.object({ id: identifier, name: z.string().trim().min(1).max(120) });
type Failure = { success: false; error: string; code?: "conflict" | "unavailable" | "invalid" };
type AssignmentResult = { success: true; changed: boolean; participant: z.infer<typeof participantSchema> } | Failure;

/** The actor comes from the verified session, never from the submitted payload. */
export async function assignParticipantAffiliate(input: unknown): Promise<AssignmentResult> {
  try {
    const db = await requireCommerceStaff();
    const session = await createClient();
    const { data: { user }, error: authError } = await session.auth.getUser();
    if (authError || !user) return { success: false, error: "Sessione scaduta. Accedi di nuovo per modificare l’affiliato." };
    const parsed = requestSchema.safeParse(input);
    if (!parsed.success) return { success: false, code: "invalid", error: "Seleziona un iscritto e un affiliato validi, poi riprova." };
    const request = parsed.data;
    const { data, error } = await db.rpc("assign_participant_affiliate", {
      p_source: request.source, p_event_id: request.eventId, p_participant_id: request.id,
      p_affiliate_id: request.affiliateId, p_expected_affiliate_id: request.expectedAffiliateId, p_actor_id: user.id,
    });
    if (error) {
      if (error.code === "40001") return { success: false, code: "conflict", error: "Un altro operatore ha modificato l’affiliato di questo iscritto. Ricarica la lista e riprova." };
      if (error.code === "22023") return { success: false, code: "unavailable", error: "L’iscritto o l’affiliato non è più disponibile. Ricarica la lista e scegli un affiliato abilitato per questo evento." };
      return { success: false, error: "Non è stato possibile aggiornare l’affiliato. Riprova." };
    }
    const result = resultSchema.safeParse(data);
    if (!result.success || result.data.participant.id !== request.id || result.data.participant.source !== request.source
      || result.data.participant.eventId !== request.eventId || result.data.participant.affiliateId !== request.affiliateId) {
      return { success: false, error: "Modifica non verificabile. Ricarica la lista prima di riprovare." };
    }
    for (const locale of ["it", "en", "de", "es"]) revalidatePath(`/${locale}/admin`, "layout");
    return { success: true, ...result.data };
  } catch {
    return { success: false, error: "Accedi con un account autorizzato per modificare l’affiliato." };
  }
}

/** Only event-enabled, available names are sent to the participant editor. */
export async function loadAssignableParticipantAffiliates(eventId: string): Promise<{ success: true; affiliates: z.infer<typeof optionSchema>[] } | Failure> {
  try {
    const db = await requireCommerceStaff();
    const parsed = identifier.safeParse(eventId);
    if (!parsed.success) return { success: false, code: "invalid", error: "Seleziona un evento valido." };
    const { data: event, error: eventError } = await db.from("events").select("affiliates").eq("id", parsed.data).maybeSingle();
    const choices = eventAffiliatesSchema.safeParse(event?.affiliates);
    if (eventError || !event || !choices.success) return { success: false, error: "Impossibile caricare gli affiliati dell’evento. Riprova." };
    const ids = choices.data.filter(affiliate => affiliate.active).map(affiliate => affiliate.id);
    if (!ids.length) return { success: true, affiliates: [] };
    const { data: rows, error } = await db.from("affiliates").select("id,name").in("id", ids).is("deleted_at", null).order("name").order("id");
    const affiliates = z.array(optionSchema).max(100).safeParse(rows);
    if (error || !affiliates.success) return { success: false, error: "Impossibile caricare gli affiliati disponibili. Riprova." };
    return { success: true, affiliates: affiliates.data };
  } catch {
    return { success: false, error: "Accedi con un account autorizzato per consultare gli affiliati." };
  }
}
