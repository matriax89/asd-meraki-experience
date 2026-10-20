import { z } from "zod";

/** Only the public name is stored here. Affiliates have no access credentials. */
export const eventAffiliatesSchema = z.array(z.object({
  id: z.string().uuid().transform((id) => id.toLowerCase()),
  name: z.string().trim().min(1, "Inserisci il nome dell’affiliato.").max(120)
    .refine((name) => !/[\u0000-\u001f\u007f]/.test(name), "Il nome contiene caratteri non validi."),
  active: z.boolean(),
}).strict()).max(100, "Puoi configurare fino a 100 affiliati per evento.").superRefine((affiliates, context) => {
  const ids = new Set<string>();
  const activeNames = new Set<string>();
  affiliates.forEach((affiliate, index) => {
    if (ids.has(affiliate.id)) context.addIssue({ code: "custom", message: "Ogni affiliato deve avere un identificativo univoco.", path: [index, "id"] });
    ids.add(affiliate.id);
    const name = affiliate.name.toLocaleLowerCase("it");
    if (affiliate.active && activeNames.has(name)) context.addIssue({ code: "custom", message: "Gli affiliati attivi devono avere nomi diversi.", path: [index, "name"] });
    if (affiliate.active) activeNames.add(name);
  });
});

export type EventAffiliate = z.infer<typeof eventAffiliatesSchema>[number];
export type PublicEventAffiliate = Pick<EventAffiliate, "id" | "name">;

export function parseEventAffiliates(value: unknown): EventAffiliate[] {
  const parsed = eventAffiliatesSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

export function publicEventAffiliates(value: unknown): PublicEventAffiliate[] {
  return parseEventAffiliates(value).filter((affiliate) => affiliate.active).map(({ id, name }) => ({ id, name }));
}
