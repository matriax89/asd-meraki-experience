"use client";

import { normalizeAffiliateCommissionValue, parseAffiliateCommissionCredits, parseAffiliateCommissionEuro, type AffiliateCommissionValue } from "@/lib/events/affiliate-commissions";

export type AffiliateCommissionDraft = { commissionType: "eur" | "credits"; euro: string; credits: string };

export function affiliateCommissionDraft(value: number | AffiliateCommissionValue = 0): AffiliateCommissionDraft {
  const rate = normalizeAffiliateCommissionValue(value);
  return { commissionType: rate.commissionType, euro: (rate.commissionCents / 100).toLocaleString("it-IT", { useGrouping: false, minimumFractionDigits: 2, maximumFractionDigits: 2 }), credits: String(rate.commissionCredits) };
}

export function parseAffiliateCommissionDraft(draft: AffiliateCommissionDraft): AffiliateCommissionValue | null {
  if (draft.commissionType === "credits") {
    const credits = parseAffiliateCommissionCredits(draft.credits);
    return credits === null ? null : { commissionType: "credits", commissionCents: 0, commissionCredits: credits };
  }
  const cents = parseAffiliateCommissionEuro(draft.euro);
  return cents === null ? null : { commissionType: "eur", commissionCents: cents, commissionCredits: 0 };
}

export function formatAffiliateCommission(value: AffiliateCommissionValue): string {
  return value.commissionType === "credits" ? `${value.commissionCredits.toLocaleString("it-IT")} ${value.commissionCredits === 1 ? "credito" : "crediti"}` : new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(value.commissionCents / 100);
}

export function affiliateCommissionValidationMessage(draft: AffiliateCommissionDraft): string {
  return draft.commissionType === "credits" ? "inserisci un numero intero di crediti da 0 a 1.000.000, senza decimali." : "usa un importo da 0 a 100.000 €, con al massimo due decimali (es. 5,00).";
}

export function AffiliateCommissionInput({ id, value, onChange, label = "Compenso per iscritto", context, disabled, invalid, errorId }: { id: string; value: AffiliateCommissionDraft; onChange: (value: AffiliateCommissionDraft) => void; label?: string; context: string; disabled?: boolean; invalid?: boolean; errorId?: string }) {
  const credits = value.commissionType === "credits";
  return <div className="min-w-0 space-y-3">
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="mb-2 text-xs font-semibold text-[#65775a]">Tipo di compenso<span className="sr-only"> · {context}</span></legend>
      <div className="grid grid-cols-2 gap-1 rounded-xl border border-[#dce2d5] bg-[#f1f4eb] p-1">
        {([{ type: "eur", text: "Euro (€)" }, { type: "credits", text: "Crediti" }] as const).map(option => <label key={option.type} className="relative min-w-0 cursor-pointer">
          <input type="radio" name={`${id}-unit`} value={option.type} checked={value.commissionType === option.type} onChange={() => onChange({ ...value, commissionType: option.type })} className="peer sr-only" />
          <span className="flex min-h-10 items-center justify-center rounded-lg px-3 text-sm font-semibold text-[#65775a] transition-colors peer-checked:bg-[#254332] peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[#8d7750] peer-disabled:opacity-60">{option.text}</span>
        </label>)}
      </div>
    </fieldset>
    <div className="space-y-1.5"><label htmlFor={id} className="block text-xs font-semibold text-[#53654b]">{label} ({credits ? "crediti" : "€"})<span className="sr-only"> · {context}</span></label>
      <input id={id} inputMode={credits ? "numeric" : "decimal"} lang="it-IT" autoComplete="off" maxLength={12} disabled={disabled} value={credits ? value.credits : value.euro} onChange={event => onChange({ ...value, [credits ? "credits" : "euro"]: event.target.value })} aria-invalid={invalid} aria-describedby={`${id}-hint${invalid && errorId ? ` ${errorId}` : ""}`} className="min-h-11 w-full min-w-0 rounded-xl border border-[#dce2d5] bg-white px-3 text-sm tabular-nums text-[#24382c] outline-offset-2 focus-visible:outline-2 focus-visible:outline-[#8d7750] disabled:opacity-60" />
      <p id={`${id}-hint`} className="text-xs leading-5 text-[#78856b]">{credits ? "Numero intero di crediti per persona. 0 significa nessun compenso." : "Importo in euro per persona. 0,00 € significa nessun compenso."}</p>
    </div>
  </div>;
}
