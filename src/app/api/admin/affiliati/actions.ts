"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCommerceStaff } from "@/lib/commerce/admin-auth";
import { affiliateRegistryEntry } from "@/lib/events/affiliate-registry";
import { affiliateProfileSchema, type AffiliateProfileInput, type AffiliateRegistryEntry } from "@/lib/events/affiliate-profile-schema";

type Result = { success: true; affiliate: AffiliateRegistryEntry } | { success: false; error: string };
const identifier = z.string().uuid().transform(value => value.toLowerCase());
function refreshAffiliates() {
  for (const locale of ["it", "en", "de", "es"]) {
    revalidatePath(`/${locale}/admin`, "layout");
    revalidatePath(`/${locale}/admin/affiliati`, "layout");
    revalidatePath(`/${locale}/admin/eventi`, "layout");
    revalidatePath(`/${locale}/eventi`, "layout");
  }
}
async function saveAffiliate(id: string | null, input: AffiliateProfileInput): Promise<Result> {
  const db = await requireCommerceStaff();
  const parsed = affiliateProfileSchema.safeParse(input);
  if (!parsed.success || id !== null && !identifier.safeParse(id).success) return { success: false, error: !parsed.success ? parsed.error.issues[0]?.message || "Controlla i dati dell’affiliato." : "Affiliato non valido." };
  const { data, error } = await db.rpc("save_affiliate_profile", { p_id: id?.toLowerCase() ?? null, p_input: parsed.data });
  if (error) return { success: false, error: error.code === "23505" ? "Esiste già un affiliato con questo nome. Cercalo anche nel Cestino." : error.code === "22023" ? "Controlla i dati e gli eventi selezionati. Ricarica il fascicolo e riprova." : "Non è stato possibile salvare l’affiliato. Riprova." };
  const affiliate = affiliateRegistryEntry(data);
  if (!affiliate) return { success: false, error: "Salvataggio non verificabile. Ricarica la pagina prima di riprovare." };
  refreshAffiliates();
  return { success: true, affiliate };
}
export async function createAffiliate(input: AffiliateProfileInput): Promise<Result> { return saveAffiliate(null, input); }
export async function updateAffiliate(id: string, input: AffiliateProfileInput): Promise<Result> { return saveAffiliate(id, input); }
async function setDeleted(id: string, deleted: boolean): Promise<Result> {
  const db = await requireCommerceStaff();
  const parsed = identifier.safeParse(id);
  if (!parsed.success) return { success: false, error: "Affiliato non valido." };
  const { data, error } = await db.rpc("set_affiliate_deleted", { p_id: parsed.data, p_deleted: deleted });
  if (error) return { success: false, error: "Operazione non completata. Ricarica il fascicolo e riprova." };
  const affiliate = affiliateRegistryEntry(data);
  if (!affiliate) return { success: false, error: "Impossibile verificare l’operazione. Ricarica la pagina." };
  refreshAffiliates();
  return { success: true, affiliate };
}
/** Reversible removal: historical attributions and compensation are retained. */
export async function deleteAffiliate(id: string): Promise<Result> { return setDeleted(id, true); }
export async function restoreAffiliate(id: string): Promise<Result> { return setDeleted(id, false); }
