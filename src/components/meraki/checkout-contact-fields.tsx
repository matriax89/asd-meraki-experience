"use client";

import { CustomSelect } from "@/components/ui/custom-select";
import { changePhoneCountry, defaultPhoneCountry, normalizeCountryPhone, PHONE_COUNTRIES, phoneCallingCode, phoneCountryForNumber, type PhoneCountry } from "@/lib/commerce/phone-country";
import { useMemo, useState } from "react";
import { checkoutCopy } from "./checkout-copy";
import styles from "./commerce-purchase.module.css";

export type CheckoutContact = {
  email: string;
  phone: string;
  documentType: "codice_fiscale" | "foreign_id";
  documentCountry: string;
  documentNumber: string;
  marketingConsent: boolean;
};

export function emptyCheckoutContact(locale: string): CheckoutContact {
  return { email: "", phone: "", documentType: locale === "it" ? "codice_fiscale" : "foreign_id", documentCountry: ({ it: "IT", de: "DE", es: "ES", en: "GB" })[locale] || "IT", documentNumber: "", marketingConsent: false };
}

const countries = "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(" ");

export function CheckoutContactFields({ locale, prefix, value, onChange, disabled, emailOnly = false, originalEmail = false, emailName, validationError }: {
  locale: string; prefix: string; value: CheckoutContact; onChange: (changes: Partial<CheckoutContact>) => void;
  disabled?: boolean; emailOnly?: boolean; originalEmail?: boolean; emailName?: string;
  validationError?: { field: string; message: string };
}) {
  const copy = checkoutCopy(locale);
  const [phoneCountry, setSelectedPhoneCountry] = useState(() => phoneCountryForNumber(value.phone, defaultPhoneCountry(locale)));
  const hasDocumentNumber = value.documentNumber.trim().length > 0;
  const validationAttributes = (field: string, description?: string) => ({
    "aria-invalid": validationError?.field === field ? true : undefined,
    "aria-describedby": [description, validationError?.field === field ? `${prefix}-${field}-error` : undefined].filter(Boolean).join(" ") || undefined,
  });
  const fieldError = (field: string) => validationError?.field === field
    ? <span id={`${prefix}-${field}-error`} className={styles.fieldError} role="alert">{validationError.message}</span>
    : null;
  const options = useMemo(() => {
    const names = new Intl.DisplayNames([locale], { type: "region" });
    return countries.map((code) => ({ code, name: names.of(code) || code })).sort((a, b) => a.name.localeCompare(b.name, locale));
  }, [locale]);
  const phoneOptions = useMemo(() => {
    const names = new Intl.DisplayNames([locale], { type: "region" });
    return PHONE_COUNTRIES.map((code) => ({ code, name: names.of(code) || code }))
      .sort((a, b) => a.name.localeCompare(b.name, locale));
  }, [locale]);
  return <div className={styles.contacts}>
    <label className={styles.label} htmlFor={`${prefix}-email`}>{originalEmail ? copy.originalEmail : emailOnly ? copy.contactEmail : copy.email}
      <input id={`${prefix}-email`} name={emailName || `${prefix}-email`} className={styles.input} type="email" {...validationAttributes("email", emailOnly ? undefined : `${prefix}-email-hint ${prefix}-operational-email-hint`)} inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} maxLength={254} required disabled={disabled} value={value.email} onChange={(event) => onChange({ email: event.target.value })} />
      {!emailOnly && <><span id={`${prefix}-email-hint`} className={`${styles.muted} block mt-1`}>{copy.emailHint}</span><span id={`${prefix}-operational-email-hint`} className={styles.operationalEmailHint}>{copy.operationalEmailHint}</span></>}{fieldError("email")}
    </label>
    {!emailOnly && <>
      <div className={styles.phoneContact}>
        <div className={styles.phoneFields}>
          <label className={styles.label} htmlFor={`${prefix}-phone-country`}>{copy.phoneCountry}
            <CustomSelect id={`${prefix}-phone-country`} name={`${prefix}-phone-country`} className={styles.input} aria-describedby={`${prefix}-phone-hint`} disabled={disabled} value={phoneCountry} onChange={(event) => {
              const nextCountry = event.target.value as PhoneCountry;
              setSelectedPhoneCountry(nextCountry);
              onChange({ phone: changePhoneCountry(value.phone, phoneCountry, nextCountry) });
            }}>
              {phoneOptions.map(({ code, name }) => <option key={code} value={code}>{name} ({phoneCallingCode(code)})</option>)}
            </CustomSelect>
          </label>
          <label className={styles.label} htmlFor={`${prefix}-phone`}>{copy.phone}
            <input id={`${prefix}-phone`} name={`${prefix}-phone`} className={styles.input} type="tel" inputMode="tel" autoComplete="tel" {...validationAttributes("phone", `${prefix}-phone-hint`)} placeholder={phoneCountry === defaultPhoneCountry(locale) ? copy.phonePlaceholder : `${phoneCallingCode(phoneCountry)} …`} required maxLength={32} disabled={disabled} value={value.phone} onChange={(event) => {
              const phone = normalizeCountryPhone(event.target.value, phoneCountry);
              setSelectedPhoneCountry(phoneCountryForNumber(phone, phoneCountry));
              onChange({ phone });
            }} />
          </label>
        </div>
        <span id={`${prefix}-phone-hint`} className={`${styles.muted} block mt-1`}>{copy.phoneHint}</span>{fieldError("phone")}
      </div>
      <label className={styles.label} htmlFor={`${prefix}-document-type`}>{copy.documentType} ({copy.optional})<CustomSelect id={`${prefix}-document-type`} name={`${prefix}-document-type`} className={styles.input} {...validationAttributes("documentType", `${prefix}-document-type-hint`)} disabled={disabled} value={value.documentType} onChange={(event) => { const documentType = event.target.value as CheckoutContact["documentType"]; onChange({ documentType, documentCountry: documentType === "codice_fiscale" ? "IT" : "", documentNumber: "" }); }}><option value="codice_fiscale">{copy.fiscalCode}</option><option value="foreign_id">{copy.foreignId}</option></CustomSelect><span id={`${prefix}-document-type-hint`} className={`${styles.muted} block mt-1`}>{copy.documentTypeHint}</span>{fieldError("documentType")}</label>
      {value.documentType === "foreign_id" && <label className={styles.label} htmlFor={`${prefix}-document-country`}>{copy.documentCountry}<CustomSelect id={`${prefix}-document-country`} name={`${prefix}-document-country`} className={styles.input} {...validationAttributes("documentCountry", `${prefix}-document-country-hint`)} required={hasDocumentNumber} disabled={disabled} value={value.documentCountry} onChange={(event) => onChange({ documentCountry: event.target.value })}><option value="">{copy.selectCountry}</option>{options.filter(({ code }) => code !== "IT").map(({ code, name }) => <option key={code} value={code}>{name}</option>)}</CustomSelect><span id={`${prefix}-document-country-hint`} className={`${styles.muted} block mt-1`}>{copy.documentCountryHint}</span>{fieldError("documentCountry")}</label>}
      <label className={styles.label} htmlFor={`${prefix}-document-number`}>{value.documentType === "codice_fiscale" ? copy.fiscalNumber : copy.documentNumber} ({copy.optional})<input id={`${prefix}-document-number`} name={`${prefix}-document-number`} className={styles.input} {...validationAttributes("documentNumber", `${prefix}-document-number-hint`)} placeholder={value.documentType === "codice_fiscale" ? copy.fiscalNumberPlaceholder : copy.documentNumberPlaceholder} autoComplete="off" autoCapitalize="characters" spellCheck={false} minLength={hasDocumentNumber ? value.documentType === "codice_fiscale" ? 11 : 3 : undefined} maxLength={value.documentType === "codice_fiscale" ? 16 : 40} disabled={disabled} value={value.documentNumber} onChange={(event) => onChange({ documentNumber: event.target.value.toUpperCase() })} /><span id={`${prefix}-document-number-hint`} className={`${styles.muted} block mt-1`}>{copy.documentHint}</span>{fieldError("documentNumber")}</label>
      <label className={styles.promotionalConsent}><input type="checkbox" name={`${prefix}-marketing-consent`} checked={value.marketingConsent} disabled={disabled} onChange={(event) => onChange({ marketingConsent: event.target.checked })} /><span>{copy.marketing}</span></label>
      <p className={styles.muted}>{copy.operationalPrivacy} <a href={`/${locale}/legal/privacy-policy`} target="_blank" rel="noopener noreferrer" className={styles.privacyLink}>{copy.privacy}</a></p>
    </>}
  </div>;
}
