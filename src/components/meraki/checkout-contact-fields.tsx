"use client";

import { CustomSelect } from "@/components/ui/custom-select";


import { useMemo } from "react";
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

export function CheckoutContactFields({ locale, prefix, value, onChange, disabled, emailOnly = false, originalEmail = false, group = false, emailName }: {
  locale: string; prefix: string; value: CheckoutContact; onChange: (changes: Partial<CheckoutContact>) => void;
  disabled?: boolean; emailOnly?: boolean; originalEmail?: boolean; group?: boolean; emailName?: string;
}) {
  const copy = checkoutCopy(locale);
  const options = useMemo(() => {
    const names = new Intl.DisplayNames([locale], { type: "region" });
    return countries.map((code) => ({ code, name: names.of(code) || code })).sort((a, b) => a.name.localeCompare(b.name, locale));
  }, [locale]);
  return <div className={styles.contacts}>
    <label className={styles.label} htmlFor={`${prefix}-email`}>{originalEmail ? copy.originalEmail : emailOnly ? copy.contactEmail : copy.email}
      <input id={`${prefix}-email`} name={emailName || `${prefix}-email`} className={styles.input} type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} maxLength={254} required disabled={disabled} value={value.email} onChange={(event) => onChange({ email: event.target.value })} />
      {!emailOnly && <span className={`${styles.muted} block mt-1`}>{copy.emailHint}</span>}
    </label>
    {!emailOnly && <>
      <label className={styles.label} htmlFor={`${prefix}-phone`}>{copy.phone}<input id={`${prefix}-phone`} name={`${prefix}-phone`} className={styles.input} type="tel" inputMode="tel" autoComplete="tel" required maxLength={32} disabled={disabled} value={value.phone} onChange={(event) => onChange({ phone: event.target.value })} /><span className={`${styles.muted} block mt-1`}>{copy.phoneHint}</span></label>
      <label className={styles.label} htmlFor={`${prefix}-document-type`}>{copy.documentType}<CustomSelect id={`${prefix}-document-type`} name={`${prefix}-document-type`} className={styles.input} required disabled={disabled} value={value.documentType} onChange={(event) => { const documentType = event.target.value as CheckoutContact["documentType"]; onChange({ documentType, documentCountry: documentType === "codice_fiscale" ? "IT" : "", documentNumber: "" }); }}><option value="codice_fiscale">{copy.fiscalCode}</option><option value="foreign_id">{copy.foreignId}</option></CustomSelect></label>
      {value.documentType === "foreign_id" && <label className={styles.label} htmlFor={`${prefix}-document-country`}>{copy.documentCountry}<CustomSelect id={`${prefix}-document-country`} name={`${prefix}-document-country`} className={styles.input} required disabled={disabled} value={value.documentCountry} onChange={(event) => onChange({ documentCountry: event.target.value })}><option value="">{copy.selectCountry}</option>{options.filter(({ code }) => code !== "IT").map(({ code, name }) => <option key={code} value={code}>{name}</option>)}</CustomSelect></label>}
      <label className={styles.label} htmlFor={`${prefix}-document-number`}>{value.documentType === "codice_fiscale" ? copy.fiscalNumber : copy.documentNumber}<input id={`${prefix}-document-number`} name={`${prefix}-document-number`} className={styles.input} autoComplete="off" autoCapitalize="characters" spellCheck={false} required minLength={value.documentType === "codice_fiscale" ? 11 : 3} maxLength={value.documentType === "codice_fiscale" ? 16 : 40} disabled={disabled} value={value.documentNumber} onChange={(event) => onChange({ documentNumber: event.target.value.toUpperCase() })} /><span className={`${styles.muted} block mt-1`}>{copy.documentHint}</span></label>
      <div className={styles.consentBox}><label className={styles.consent}><input type="checkbox" role="switch" name={`${prefix}-marketing-consent`} checked={value.marketingConsent} disabled={disabled} onChange={(event) => onChange({ marketingConsent: event.target.checked })} /><span><span className={styles.label}>{copy.marketing}</span><span className={`${styles.muted} block mt-1`}>{copy.marketingHint}</span></span></label>{group && <p className={`${styles.muted} mt-2`}>{copy.groupConsent}</p>}</div>
      <p className={styles.muted}>{copy.operationalPrivacy} <a href={`/${locale}/legal/privacy-policy`} target="_blank" rel="noopener noreferrer" className={styles.privacyLink}>{copy.privacy}</a></p>
    </>}
  </div>;
}
