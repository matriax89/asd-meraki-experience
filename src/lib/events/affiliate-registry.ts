import "server-only";
import { z } from "zod";
import { requireCommerceStaff } from "@/lib/commerce/admin-auth";
import { affiliateNameSchema, type AffiliateRegistryEntry } from "./affiliate-profile-schema";
export { affiliateNameSchema } from "./affiliate-profile-schema";
export type { AffiliateRegistryEntry } from "./affiliate-profile-schema";
const registryRowSchema = z.object({
  id: z.string().uuid(), name: affiliateNameSchema, created_at: z.string().min(1),
  contact_name: z.string().max(120).optional().default(""), email: z.string().max(254).optional().default(""),
  phone: z.string().max(40).optional().default(""), notes: z.string().max(2000).optional().default(""),
  default_commission_type: z.enum(["eur", "credits"]).optional().default("eur"),
  default_commission_credits: z.number().int().min(0).max(1_000_000).optional().default(0),
  default_commission_cents: z.number().int().min(0).max(10_000_000).optional().default(0),
  deleted_at: z.string().nullable().optional().default(null),
}).refine(row => row.default_commission_type === "eur" ? row.default_commission_credits === 0 : row.default_commission_cents === 0);
export function affiliateRegistryEntry(value: unknown): AffiliateRegistryEntry | null {
  const parsed = registryRowSchema.safeParse(value);
  if (!parsed.success) return null;
  const row = parsed.data;
  return { id: row.id, name: row.name, createdAt: row.created_at, contactName: row.contact_name, email: row.email,
    phone: row.phone, notes: row.notes, defaultCommissionType: row.default_commission_type, defaultCommissionCents: row.default_commission_cents, defaultCommissionCredits: row.default_commission_credits, deletedAt: row.deleted_at };
}
/** Full private staff-only dossier. Public event snapshots contain only id/name/active. */
export async function loadAffiliateRegistry(options: { includeDeleted?: boolean } = {}): Promise<AffiliateRegistryEntry[]> {
  const db = await requireCommerceStaff();
  const entries: AffiliateRegistryEntry[] = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    let query = db.from("affiliates").select("id,name,created_at,contact_name,email,phone,notes,default_commission_type,default_commission_cents,default_commission_credits,deleted_at");
    if (!options.includeDeleted) query = query.is("deleted_at", null);
    const { data, error } = await query.order("name").order("id").range(from, from + pageSize - 1);
    if (error || !data) throw new Error("Impossibile caricare l’anagrafica degli affiliati. Riprova.");
    for (const row of data) {
      const entry = affiliateRegistryEntry(row);
      if (!entry) throw new Error("L’anagrafica contiene un affiliato non valido. Verifica i dati salvati.");
      entries.push(entry);
    }
    if (data.length < pageSize) return entries.sort((a, b) => a.name.localeCompare(b.name, "it") || a.id.localeCompare(b.id));
  }
}
