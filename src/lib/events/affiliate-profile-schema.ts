import { z } from "zod";
import { affiliateCommissionFields } from "./affiliate-commissions";

export const affiliateNameSchema = z.string().trim().min(1, "Inserisci il nome dell’affiliato.")
  .max(120, "Usa al massimo 120 caratteri.")
  .refine(value => !/[\u0000-\u001f\u007f]/.test(value), "Il nome contiene caratteri non validi.")
  .transform(value => value.replace(/\s+/g, " "));
const shortText = (limit: number) => z.string().trim().max(limit).refine(value => !/[\u0000-\u001f\u007f]/.test(value), "Il campo contiene caratteri non validi.").optional().default("");
export const affiliateProfileSchema = z.object({
  name: affiliateNameSchema,
  contactName: shortText(120),
  email: z.string().trim().max(254).refine(value => !value || z.email().safeParse(value).success, "Inserisci un’email valida.").optional().default(""),
  phone: z.string().trim().max(40).refine(value => !value || /^[+\d\s()./-]+$/.test(value) && /\d/.test(value), "Inserisci un numero di telefono valido.").optional().default(""),
  notes: z.string().trim().max(2000).refine(value => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value), "Le note contengono caratteri non validi.").optional().default(""),
  defaultCommissionType: z.enum(["eur", "credits"]).optional().default("eur"),
  defaultCommissionCredits: z.number().int().min(0).max(1_000_000).optional().default(0),
  defaultCommissionCents: z.number().int().min(0).max(10_000_000).optional().default(0),
  assignments: z.array(z.object({ eventId: z.string().uuid().transform(value => value.toLowerCase()), ...affiliateCommissionFields }).strict().refine(value => value.commissionType === "eur" ? value.commissionCredits === 0 : value.commissionCents === 0, "L’importo dell’unità non selezionata deve essere zero.")).max(100)
    .refine(items => new Set(items.map(item => item.eventId)).size === items.length, "Ogni evento può essere selezionato una sola volta.").optional(),
}).strict().refine(value => value.defaultCommissionType === "eur" ? value.defaultCommissionCredits === 0 : value.defaultCommissionCents === 0, "L’importo dell’unità non selezionata deve essere zero.");
export type AffiliateProfileInput = z.input<typeof affiliateProfileSchema>;
export type AffiliateRegistryEntry = {
  id: string; name: string; createdAt: string; contactName: string; email: string; phone: string; notes: string;
  defaultCommissionType: "eur" | "credits"; defaultCommissionCents: number; defaultCommissionCredits: number; deletedAt: string | null;
};
