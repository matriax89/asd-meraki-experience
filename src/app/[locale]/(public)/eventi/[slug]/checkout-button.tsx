"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLocale } from "next-intl";
import { ArrowRight, LoaderCircle, LockKeyhole, Ticket, X } from "lucide-react";
import { attendeeSchema } from "@/lib/commerce/attendee";
import { CheckoutContactFields, emptyCheckoutContact } from "@/components/meraki/checkout-contact-fields";
import { checkoutCopy } from "@/components/meraki/checkout-copy";
import { safeCommerceRedirect } from "@/components/meraki/commerce-public-model";
import { useCheckoutViewport } from "@/components/meraki/use-checkout-viewport";
import styles from "@/components/meraki/commerce-purchase.module.css";
import { DiscountBreakdown, DiscountCodeFields, discountCodeValue, type DiscountQuote } from "@/components/meraki/discount-code-fields";
import { discountError } from "@/components/meraki/discount-copy";

export function CheckoutButton({ eventId }: { eventId: string }) {
  const locale = useLocale();
  const copy = checkoutCopy(locale);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [contact, setContact] = useState(() => emptyCheckoutContact(locale));
  const [error, setError] = useState<string | null>(null);
  const [discountInput, setDiscountInput] = useState("");
  const [discountCode, setDiscountCode] = useState("");
  const [quote, setQuote] = useState<DiscountQuote | null>(null);
  const [quoteKey, setQuoteKey] = useState<string | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState("");
  const [quoteRetry, setQuoteRetry] = useState(0);
  const [checkoutHold, setCheckoutHold] = useState<{ inputKey: string; fingerprint: string } | null>(null);
  const requestKey = `${eventId}:${discountCode}`;
  const currentQuote = quoteKey === requestKey ? quote : null;
  const checkoutInputKey = JSON.stringify({ eventId, locale, discountCode, contact });
  const preserveAcceptedQuote = checkoutHold?.inputKey === checkoutInputKey;
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const submitting = useRef(false);
  const attempt = useRef<string | null>(null);
  const fingerprint = useRef("");
  const previousOverflow = useRef("");
  const opened = useRef(false);
  useCheckoutViewport(dialog, open);

  useEffect(() => () => { if (opened.current) document.body.style.overflow = previousOverflow.current; }, []);
  useEffect(() => {
    if (!open || preserveAcceptedQuote) return;
    const controller = new AbortController();
    void fetch("/api/checkout/ticket/quote", { method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", signal: controller.signal, body: JSON.stringify({ eventId, ...(discountCode ? { discountCode } : {}) }) }).then(async (response) => {
      const result = await response.json();
      if (!response.ok || !result.quote) throw new Error(discountError(result.code, locale) || (locale === "it" ? result.error : "") || copy.quoteError);
      if (!controller.signal.aborted) { setQuote(result.quote); setQuoteKey(requestKey); }
    }).catch((cause) => { if (!controller.signal.aborted) { setQuote(null); setQuoteError(cause instanceof Error && !/fetch|network|offline/i.test(cause.message) ? cause.message : copy.offline); } }).finally(() => { if (!controller.signal.aborted) setQuoteLoading(false); });
    return () => controller.abort();
  }, [open, eventId, discountCode, quoteRetry, locale, copy, requestKey, preserveAcceptedQuote]);

  function resetCheckoutAttempt() {
    attempt.current = null; fingerprint.current = "";
    if (checkoutHold) { setCheckoutHold(null); setQuote(null); setQuoteLoading(true); setQuoteRetry((value) => value + 1); }
  }

  function openCheckout() {
    if (!dialog.current || dialog.current.open) return;
    previousOverflow.current = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    opened.current = true;
    setOpen(true);
    if (!preserveAcceptedQuote) setQuoteLoading(true);
    setQuoteError("");
    dialog.current.showModal();
  }
  function closeCheckout() { if (!submitting.current) dialog.current?.close(); }

  async function handleCheckout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || !currentQuote || quoteLoading) return;
    const form = new FormData(event.currentTarget);
    const checked = attendeeSchema.safeParse({ firstName: String(form.get("nome") || "").trim(), lastName: String(form.get("cognome") || "").trim(), ...contact, email: String(form.get("email") || "").trim() });
    if (!checked.success) { setError(copy.invalidData); return; }
    submitting.current = true;
    setLoading(true);
    setError(null);
    const body = { eventId, buyerEmail: checked.data.email, buyerNome: checked.data.firstName, buyerCognome: checked.data.lastName, attendee: checked.data, locale, expectedTotalCents: currentQuote.totalCents, ...(discountCode ? { discountCode } : {}) };
    const currentFingerprint = JSON.stringify(body);
    if (preserveAcceptedQuote && checkoutHold.fingerprint !== currentFingerprint) {
      resetCheckoutAttempt(); setError(copy.priceChanged); submitting.current = false; setLoading(false); return;
    }
    if (fingerprint.current !== currentFingerprint) { fingerprint.current = currentFingerprint; attempt.current = null; }
    attempt.current ??= crypto.randomUUID();
    setCheckoutHold({ inputKey: checkoutInputKey, fingerprint: currentFingerprint });
    try {
      const response = await fetch("/api/checkout/ticket", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, checkoutAttemptId: attempt.current }) });
      const data = await response.json();
      if (!response.ok || typeof data.url !== "string") {
        const deterministic = data.code !== "checkout_pending" && (typeof data.code === "string"
          || (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429));
        if (deterministic) { resetCheckoutAttempt(); setCheckoutHold(null); setQuote(null); setQuoteLoading(true); setQuoteRetry((value) => value + 1); }
        if (data.code === "request_expired" || data.code === "price_changed") attempt.current = null;
        if (data.code === "price_changed" && data.quote) { setQuote(data.quote); setQuoteKey(requestKey); throw new Error(copy.priceChanged); }
        throw new Error(discountError(data.code, locale) || (locale === "it" ? data.error : "") || copy.checkoutError);
      }
      const checkoutUrl = safeCommerceRedirect(data.url, window.location.origin);
      if (!checkoutUrl) throw new Error(copy.redirectError);
      window.location.assign(checkoutUrl);
    } catch (cause) {
      setError(cause instanceof Error && !/fetch|network|offline/i.test(cause.message) ? cause.message : copy.offline);
      submitting.current = false;
      setLoading(false);
    }
  }

  return <>
    <button ref={trigger} type="button" onClick={openCheckout} className={styles.button}>{copy.legacyAction}<ArrowRight className="h-5 w-5" aria-hidden="true" /></button>
    <dialog ref={dialog} className={styles.dialog} aria-labelledby={`checkout-title-${eventId}`} onCancel={(event) => { if (submitting.current) event.preventDefault(); }} onClose={() => { setOpen(false); document.body.style.overflow = previousOverflow.current; opened.current = false; trigger.current?.focus(); }} onClick={(event) => { if (event.target === event.currentTarget) closeCheckout(); }}>
      <div className={styles.content}>
        <div className={styles.header}><div><p className={styles.eyebrow}>{copy.legacyEyebrow}</p><h2 id={`checkout-title-${eventId}`} className={styles.title}>{copy.legacyTitle}</h2></div><button type="button" aria-label={copy.close} disabled={loading} onClick={closeCheckout} className={styles.close}><X className="h-5 w-5" /></button></div>
        <div className={styles.scrollArea} data-checkout-scroll>
          <form onSubmit={handleCheckout} onChange={resetCheckoutAttempt} className={styles.stack}>
            <p className={styles.muted}>{copy.legacyIntro}</p>
            <div className={styles.fields}><label className={styles.label} htmlFor={`buyer-name-${eventId}`}>{copy.firstName}<input id={`buyer-name-${eventId}`} className={styles.input} name="nome" required maxLength={100} autoComplete="given-name" disabled={loading} /></label><label className={styles.label} htmlFor={`buyer-surname-${eventId}`}>{copy.lastName}<input id={`buyer-surname-${eventId}`} className={styles.input} name="cognome" required maxLength={100} autoComplete="family-name" disabled={loading} /></label></div>
            <CheckoutContactFields locale={locale} prefix="buyer" emailName="email" value={contact} onChange={(changes) => { resetCheckoutAttempt(); setContact((value) => ({ ...value, ...changes })); setError(null); }} disabled={loading} />
            <DiscountCodeFields id={`ticket-code-${eventId}`} locale={locale} value={discountInput} requestedCode={discountCode} appliedCode={currentQuote?.discount?.code} loading={loading} pending={quoteLoading} onChange={(value) => { resetCheckoutAttempt(); setDiscountInput(value); if (discountCode) { setDiscountCode(""); setQuote(null); setQuoteLoading(true); } setQuoteError(""); setError(null); }} onApply={() => { resetCheckoutAttempt(); setDiscountCode(discountCodeValue(discountInput)); setQuote(null); setQuoteLoading(true); setQuoteError(""); setError(null); setQuoteRetry((value) => value + 1); }} onRemove={() => { resetCheckoutAttempt(); setDiscountInput(""); setDiscountCode(""); setQuote(null); setQuoteLoading(true); setQuoteError(""); setError(null); }} />
            <div className={styles.summary} aria-live="polite">{quoteLoading ? <p className={styles.muted}>{copy.checkingTotal}</p> : currentQuote ? <><DiscountBreakdown quote={currentQuote} locale={locale} /><div className={styles.total}><span>{copy.total}</span><span>{new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(currentQuote.totalCents / 100)}</span></div><p className={`${styles.muted} mt-2`}>{copy.holdHint}</p></> : null}{quoteError && <><p role="alert" className={styles.error}>{quoteError}</p><button type="button" className={styles.smallButton} onClick={() => { setQuote(null); setQuoteLoading(true); setQuoteError(""); setQuoteRetry((value) => value + 1); }}>{copy.recheck}</button></>}</div>
            {error && <p role="alert" className={styles.error}>{error}</p>}
            <button type="submit" disabled={loading || quoteLoading || !currentQuote} className={styles.button}>{loading ? <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" /> : <LockKeyhole className="h-4 w-4" aria-hidden="true" />}{loading ? copy.openingPayment : copy.continuePay}</button>
            <p className={`${styles.muted} text-center`}><Ticket className="mr-1 inline h-3.5 w-3.5" />{copy.legacySecure}</p>
          </form>
        </div>
      </div>
    </dialog>
  </>;
}
