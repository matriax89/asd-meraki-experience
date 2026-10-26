import parsePhoneNumber, { getCountries, getCountryCallingCode, type CountryCode } from "libphonenumber-js/min";
import metadata from "libphonenumber-js/metadata.min.json";

export type PhoneCountry = CountryCode;

export const PHONE_COUNTRIES: readonly PhoneCountry[] = getCountries();

export function defaultPhoneCountry(locale: string): PhoneCountry {
  return ({ it: "IT", en: "GB", de: "DE", es: "ES" } as Record<string, PhoneCountry>)[locale] || "IT";
}

export function phoneCallingCode(country: PhoneCountry): string {
  return `+${getCountryCallingCode(country)}`;
}

function compactPhone(value: string): string {
  const compact = value.trim().replace(/[\s().-]/g, "");
  return compact.startsWith("00") && compact.length > 2 ? `+${compact.slice(2)}` : compact;
}

function internationalCallingCode(value: string): string | undefined {
  if (!/^\+[1-9]\d*$/.test(value)) return undefined;
  const callingCodes = metadata.country_calling_codes as Record<string, PhoneCountry[]>;
  for (let length = 1; length <= 3; length++) {
    const candidate = value.slice(1, length + 1);
    if (callingCodes[candidate]) return candidate;
  }
}

export function phoneCountryForNumber(value: string, fallback: PhoneCountry): PhoneCountry {
  const compact = compactPhone(value);
  const callingCode = internationalCallingCode(compact);
  if (!callingCode) return fallback;
  const parsed = parsePhoneNumber(compact);
  if (parsed?.country && parsed.isPossible()) return parsed.country;
  const countries = (metadata.country_calling_codes as Record<string, PhoneCountry[]>)[callingCode];
  // Shared prefixes keep the selected country while the number is incomplete.
  return countries.includes(fallback) ? fallback : countries[0];
}

export function normalizeCountryPhone(value: string, country: PhoneCountry): string {
  const compact = compactPhone(value);
  // Keep incomplete edits and malformed input visible for the existing field validation.
  if (!compact || compact === "+" || compact === "0" || compact === "00") return compact;
  if (!/^\+?\d+$/.test(compact)) return value.trim();
  const parsed = parsePhoneNumber(compact, country);
  if (compact.startsWith("+")) return parsed?.number || compact;
  return parsed?.number || `${phoneCallingCode(country)}${compact}`;
}

export function changePhoneCountry(value: string, from: PhoneCountry, to: PhoneCountry): string {
  const compact = compactPhone(value);
  const prefix = phoneCallingCode(to);
  if (!compact || compact === "+" || compact === "00") return prefix;
  if (!/^\+?\d+$/.test(compact)) return value.trim();
  const normalized = normalizeCountryPhone(compact, from);
  const callingCode = internationalCallingCode(normalized);
  if (normalized.startsWith("+") && !callingCode) return normalized.length <= 4 ? prefix : normalized;
  const nationalNumber = callingCode ? normalized.slice(callingCode.length + 1) : compact;
  return `${prefix}${nationalNumber}`;
}
