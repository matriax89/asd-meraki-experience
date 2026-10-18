"use server";

import { z } from "zod";
import { requireCommerceStaff } from "@/lib/commerce/admin-auth";

const requestSchema = z.object({ source: z.enum(["commerce", "legacy"]), id: z.string().uuid() });

/** Fetch only after an explicit staff request; full IDs are absent from the page payload. */
export async function revealParticipantDocument(input: unknown) {
  try {
    const db = await requireCommerceStaff();
    const request = requestSchema.parse(input);
    const table = request.source === "commerce" ? "commerce_attendee_contacts" : "legacy_ticket_attendee_contacts";
    const key = request.source === "commerce" ? "id" : "ticket_id";
    const { data, error } = await db.from(table).select("document_number").eq(key, request.id).maybeSingle();
    if (error || !data) return { success: false as const, error: "Documento non disponibile." };
    return { success: true as const, documentNumber: String(data.document_number) };
  } catch {
    return { success: false as const, error: "Accedi con un account autorizzato per consultare i dati." };
  }
}
