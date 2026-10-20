"use client";

import { discountCopy } from "./discount-copy";
import styles from "./commerce-purchase.module.css";

export type DiscountQuote = { subtotalCents?: number; discountCents?: number; totalCents: number; discount?: { code: string; targetType?: string; targetIds?: string[] } | null };
export const discountCodeValue = (value: string) => value.trim().toUpperCase();

export function DiscountCodeFields({ id, locale, value, requestedCode, appliedCode, loading, pending, onChange, onApply, onRemove }: {
  id: string; locale: string; value: string; requestedCode: string; appliedCode?: string;
  loading: boolean; pending: boolean; onChange: (value: string) => void; onApply: () => void; onRemove: () => void;
}) {
  const copy = discountCopy(locale);
  return <div className={styles.discountBox}>
    <label htmlFor={id} className={styles.label}>{copy.label}</label>
    <div className={styles.discountEntry}>
      <input id={id} name="discountCode" className={styles.input} value={value} maxLength={50} autoComplete="off" autoCapitalize="characters" autoCorrect="off" spellCheck={false} disabled={loading} aria-describedby={`${id}-hint`}
        onChange={(event) => onChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); if (!loading && discountCodeValue(value)) onApply(); } }} />
      {requestedCode ? <button type="button" className={styles.discountButton} disabled={loading} onClick={onRemove}>{copy.remove}</button>
        : <button type="button" className={styles.discountButton} disabled={loading || !discountCodeValue(value)} onClick={onApply}>{copy.apply}</button>}
    </div>
    <p id={`${id}-hint`} className={styles.muted}>{copy.hint}</p>
    {appliedCode && <p role="status" className={styles.discountApplied}>{copy.applied}: <strong>{appliedCode}</strong></p>}
    {pending && requestedCode && <p role="status" className={styles.muted}>{copy.checking}</p>}
  </div>;
}

export function DiscountBreakdown({ quote, locale, scope }: { quote: DiscountQuote; locale: string; scope?: string }) {
  if (!quote.discountCents || !quote.discount) return null;
  const copy = discountCopy(locale);
  const money = (value: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(value / 100);
  return <dl className={styles.discountBreakdown}>
    <div><dt>{copy.subtotal}</dt><dd>{money(quote.subtotalCents ?? quote.totalCents + quote.discountCents)}</dd></div>
    <div><dt>{copy.discount} <span>({quote.discount.code})</span>{scope ? <span className="block font-normal">{scope}</span> : null}</dt><dd>−{money(quote.discountCents)}</dd></div>
  </dl>;
}
