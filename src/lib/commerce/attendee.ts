import { z } from 'zod';
import type { CommerceAttendee, CommerceParticipant } from './types';

/** Version of the notice shown before a guest checkout; the server owns this value. */
export const ATTENDEE_PRIVACY_VERSION = '2026-10-18-v1';
export const MARKETING_CONSENT_VERSION = '2026-10-18-v1';
export const ATTENDEE_COUNTRIES = ('AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW').split(' ');
const countries = new Set(ATTENDEE_COUNTRIES);
const oddValues = [1, 0, 5, 7, 9, 13, 15, 17, 19, 21, 2, 4, 18, 20, 11, 3, 6, 8, 12, 14, 16, 10, 22, 25, 24, 23];

export function normalizePhone(value: string): string {
  const compact = value.trim().replace(/[\s().-]/g, '');
  return compact.startsWith('00') ? `+${compact.slice(2)}` : compact;
}

/** Supports the Italian checksum, including omocodia and numeric tax identifiers. */
export function isValidItalianTaxCode(value: string): boolean {
  const code = value.toUpperCase().replace(/\s/g, '');
  if (/^\d{11}$/.test(code)) {
    let sum = 0;
    for (let index = 0; index < 10; index++) {
      const digit = Number(code[index]);
      const weighted = index % 2 ? digit * 2 : digit;
      sum += weighted > 9 ? weighted - 9 : weighted;
    }
    return (10 - sum % 10) % 10 === Number(code[10]);
  }
  if (!/^[A-Z]{6}[0-9LMNPQRSTUV]{2}[ABCDEHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/.test(code)) return false;
  let sum = 0;
  for (let index = 0; index < 15; index++) {
    const character = code[index];
    const numeric = /\d/.test(character) ? Number(character) : character.charCodeAt(0) - 65;
    sum += index % 2 ? numeric : oddValues[numeric];
  }
  return String.fromCharCode(65 + sum % 26) === code[15];
}

const readable = z.string().trim().min(1).max(100).refine(value => Array.from(value).every(character => character.charCodeAt(0) > 31 && character.charCodeAt(0) !== 127), 'invalid_name');
export const attendeeSchema = z.object({
  firstName: readable,
  lastName: readable,
  email: z.string().trim().max(254).pipe(z.email()).transform(value => value.toLowerCase()),
  phone: z.string().max(40).transform(normalizePhone).refine(value => /^\+[1-9]\d{6,14}$/.test(value), 'invalid_phone'),
  documentType: z.enum(['codice_fiscale', 'foreign_id']),
  documentCountry: z.string().trim().toUpperCase().refine(value => countries.has(value), 'invalid_country'),
  documentNumber: z.string().trim().min(3).max(40).transform(value => value.toUpperCase().replace(/\s+/g, ' ')),
  marketingConsent: z.boolean(),
}).strict().superRefine((attendee, ctx) => {
  if (attendee.documentType === 'codice_fiscale') {
    if (attendee.documentCountry !== 'IT') ctx.addIssue({ code: 'custom', message: 'invalid_country', path: ['documentCountry'] });
    if (!isValidItalianTaxCode(attendee.documentNumber)) ctx.addIssue({ code: 'custom', message: 'invalid_tax_code', path: ['documentNumber'] });
  } else {
    if (attendee.documentCountry === 'IT') ctx.addIssue({ code: 'custom', message: 'foreign_country_required', path: ['documentCountry'] });
    if (!/^[A-Z0-9][A-Z0-9 -]{1,30}[A-Z0-9]$/.test(attendee.documentNumber)) ctx.addIssue({ code: 'custom', message: 'invalid_foreign_id', path: ['documentNumber'] });
  }
});

export const attendeesSchema = z.array(attendeeSchema).min(1).max(20);

/** Pricing never sees contact, tax identifier, or consent data. Array index is the stable link. */
export function parseCheckoutAttendees(input: unknown, participants: CommerceParticipant[]): CommerceAttendee[] | null {
  const parsed = attendeesSchema.safeParse(input);
  if (!parsed.success || parsed.data.length !== participants.length) return null;
  if (parsed.data.some((person, index) => person.firstName !== participants[index].firstName || person.lastName !== participants[index].lastName)) return null;
  return parsed.data.map(person => ({ ...person, documentNumber: person.documentType === 'codice_fiscale' ? person.documentNumber.replace(/\s/g, '') : person.documentNumber }));
}
