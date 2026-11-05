import { z } from 'zod';
import { participantSchema } from './config';
import { parseCheckoutAttendees } from './attendee';
import type { CommerceAttendee } from './types';

const discount = z.string().trim().max(50).regex(/^[a-z0-9_-]*$/i).transform(value => value.toUpperCase());
export const manualSelectionSchema = z.object({
  eventId: z.string().uuid(),
  participants: z.array(participantSchema).min(1).max(10),
  upgradePassId: z.string().uuid().optional(),
  discountCode: discount.optional(),
  affiliateId: z.string().uuid().nullable().optional(),
}).strict().refine(body => !body.upgradePassId || body.participants.length === 1, 'Un upgrade aggiorna un solo biglietto.');

export const manualEnrollmentSchema = z.object({
  requestId: z.string().uuid(), eventId: z.string().uuid(),
  buyerEmail: z.string().trim().max(254).pipe(z.email()).transform(value => value.toLowerCase()),
  locale: z.enum(['it', 'en', 'de', 'es']).default('it'),
  participants: z.array(participantSchema).min(1).max(10),
  attendees: z.unknown().optional(), upgradePassId: z.string().uuid().optional(),
  discountCode: discount.optional(), affiliateId: z.string().uuid().nullable().optional(),
  expectedTotalCents: z.number().int().min(0).max(10_000_000),
  paymentMethod: z.enum(['cash', 'pos']), paidAt: z.iso.datetime({ offset: true }),
  paymentReference: z.string().trim().max(200).optional(),
  feeCents: z.number().int().min(0).nullable().default(null),
  note: z.string().trim().max(2000).optional(), confirm: z.literal(true),
}).strict().superRefine((body, ctx) => {
  if (Date.parse(body.paidAt) > Date.now() + 300_000 || Date.parse(body.paidAt) < Date.parse('2000-01-01T00:00:00Z')) ctx.addIssue({ code: 'custom', message: 'Data del pagamento non valida.', path: ['paidAt'] });
  if (body.feeCents !== null && body.feeCents > body.expectedTotalCents) ctx.addIssue({ code: 'custom', message: 'La commissione supera il pagamento.', path: ['feeCents'] });
  if (body.paymentMethod === 'cash' && body.feeCents !== null && body.feeCents !== 0) ctx.addIssue({ code: 'custom', message: 'I pagamenti in contanti non hanno commissioni.', path: ['feeCents'] });
  if (body.upgradePassId && (body.participants.length !== 1 || body.attendees != null || body.affiliateId != null)) ctx.addIssue({ code: 'custom', message: 'L’upgrade conserva persona e affiliato del biglietto.', path: ['upgradePassId'] });
}).transform(body => ({ ...body, feeCents: body.paymentMethod === 'cash' ? 0 : body.feeCents }));

export type ManualSelection = z.infer<typeof manualSelectionSchema>;
export type ManualEnrollment = z.infer<typeof manualEnrollmentSchema>;
export type ManualEnrollmentResult = { orderId: string; passIds: string[]; replayed: boolean; emailStatus: 'sent' | 'pending' };

export function manualAttendees(body: ManualEnrollment): CommerceAttendee[] | null {
  if (body.upgradePassId) return null;
  const attendees = parseCheckoutAttendees(body.attendees, body.participants);
  if (!attendees || attendees[0].email !== body.buyerEmail || attendees.some(person => person.marketingConsent)) return null;
  return attendees;
}
