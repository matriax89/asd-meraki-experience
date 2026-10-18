"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowRight, Check, LoaderCircle, LockKeyhole, Plus, Ticket, X } from "lucide-react";
import { activityAvailable, currentTier, eligiblePackages, packageAvailable, packageSavings, safeCommerceRedirect, type CommerceCatalog, type CommerceParticipant, type CommerceUpgrade } from "./commerce-public-model";
import styles from "./commerce-purchase.module.css";
import { attendeesSchema } from "@/lib/commerce/attendee";
import { checkoutCopy } from "./checkout-copy";
import { CheckoutContactFields, emptyCheckoutContact, type CheckoutContact } from "./checkout-contact-fields";
import { useCheckoutViewport } from "./use-checkout-viewport";

type Quote = { totalCents: number; lines: { label: string; quantity: number; unitAmountCents: number; totalCents: number; kind: string }[] };
type Selection = { participants: CommerceParticipant[]; contacts: CheckoutContact[]; buyerEmail: string };
const money = (amount: number, locale: string) => new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(amount / 100);
const deadline = (value: string, locale: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" }).format(new Date(value));

export function CommercePurchase({ eventId, locale, ended, fallback, upgrade }: { eventId: string; locale: string; ended: boolean; fallback?: ReactNode; upgrade?: CommerceUpgrade }) {
  const copy = checkoutCopy(locale);
  const [catalog, setCatalog] = useState<CommerceCatalog | null | undefined>(undefined);
  const [catalogError, setCatalogError] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (ended) return;
    const controller = new AbortController();
    void fetch(`/api/commerce/catalog?eventId=${encodeURIComponent(eventId)}`, { cache: "no-store", signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error("catalog");
      const result = await response.json();
      if (!controller.signal.aborted) { setCatalog(result.config?.enabled ? result : null); setCatalogError(false); }
    }).catch(() => { if (!controller.signal.aborted) setCatalogError(true); });
    return () => controller.abort();
  }, [eventId, ended, reload]);
  if (ended || catalog === null) return upgrade ? null : fallback;
  if (catalogError) return <div role="status"><p className={styles.muted}>{copy.catalogError}</p><button className={styles.smallButton} type="button" onClick={() => { setCatalogError(false); setReload((value) => value + 1); }}>{copy.retry}</button></div>;
  if (!catalog) return <p role="status" className={styles.muted}><LoaderCircle className="mr-2 inline h-4 w-4 animate-spin" aria-hidden="true" /> {copy.checkingOffers}</p>;
  if (upgrade && !catalog.config.upgradesEnabled) return null;
  return <Purchase catalog={catalog} locale={locale} upgrade={upgrade} />;
}

function Purchase({ catalog, locale, upgrade }: { catalog: CommerceCatalog; locale: string; upgrade?: CommerceUpgrade }) {
  const copy = checkoutCopy(locale);
  const offers = eligiblePackages(catalog, upgrade);
  const [now, setNow] = useState(() => Date.now());
  const [open, setOpen] = useState(false);
  const [waitlist, setWaitlist] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState("");
  const [quoteRetry, setQuoteRetry] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [waitlistSaved, setWaitlistSaved] = useState(false);
  const initial = (): CommerceParticipant => ({ firstName: upgrade?.firstName || "", lastName: upgrade?.lastName || "", packageId: upgrade?.packageId || offers.find((offer) => packageAvailable(catalog, offer.id, upgrade?.activityIds, now))?.id || offers[0]?.id || "", addonIds: [], menuChoices: {} });
  const [selection, setSelection] = useState<Selection>(() => ({ participants: [initial()], contacts: [emptyCheckoutContact(locale)], buyerEmail: upgrade?.contact?.email || "" }));
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useCheckoutViewport(dialog, open);
  const previousOverflow = useRef("");
  const submitting = useRef(false);
  const attempt = useRef<string | null>(null);
  const attemptBody = useRef("");
  const opened = useRef(false);
  const base = useMemo(() => ({ eventId: catalog.event.id, participants: selection.participants, ...(upgrade ? { upgradePassId: upgrade.passId, upgradeToken: upgrade.token } : {}) }), [catalog.event.id, selection.participants, upgrade]);

  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30000); return () => window.clearInterval(timer); }, []);
  useEffect(() => () => { if (opened.current) document.body.style.overflow = previousOverflow.current; }, []);
  useEffect(() => {
    if (!open || waitlist) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setQuoteLoading(true); setQuoteError(""); setQuote(null);
      void fetch("/api/commerce/quote", { method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", body: JSON.stringify(base), signal: controller.signal }).then(async (response) => {
        const result = await response.json();
        if (!response.ok || !result.quote) throw new Error((locale === "it" ? result.error : "") || copy.quoteError);
        if (!controller.signal.aborted) setQuote(result.quote);
      }).catch((cause) => { if (!controller.signal.aborted) setQuoteError(cause instanceof Error && !/fetch|network|offline/i.test(cause.message) ? cause.message : copy.offline); }).finally(() => { if (!controller.signal.aborted) setQuoteLoading(false); });
    }, 250);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [base, now, open, waitlist, quoteRetry, locale, copy]);

  function show(asWaitlist = false) {
    if (!dialog.current || dialog.current.open) return;
    setWaitlist(asWaitlist); setError(""); setWaitlistSaved(false); setNow(Date.now()); setOpen(true);
    previousOverflow.current = document.body.style.overflow; document.body.style.overflow = "hidden"; opened.current = true; dialog.current.showModal();
  }
  function updateParticipant(index: number, changes: Partial<CommerceParticipant>) {
    setQuote(null); setQuoteError(""); setError("");
    setSelection((value) => ({ ...value, participants: value.participants.map((item, position) => position === index ? { ...item, ...changes } : item) }));
  }
  function updateContact(index: number, changes: Partial<CheckoutContact>) {
    setError("");
    setSelection((value) => ({ ...value, contacts: value.contacts.map((contact, position) => position === index ? { ...contact, ...changes } : contact) }));
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || (!waitlist && (!quote || quoteLoading))) return;
    submitting.current = true; setLoading(true); setError("");
    try {
      if (waitlist) {
        const participant = selection.participants[0];
        const response = await fetch("/api/commerce/waitlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId: catalog.event.id, email: selection.contacts[0].email.trim(), locale, name: [participant.firstName.trim(), participant.lastName.trim()].join(" "), packageId: participant.packageId }) });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error((locale === "it" ? result.error : "") || copy.waitlistError);
        setWaitlistSaved(true); return;
      }
      const participants = base.participants.map((participant) => ({ ...participant, firstName: participant.firstName.trim(), lastName: participant.lastName.trim() }));
      const checked = upgrade ? null : attendeesSchema.safeParse(participants.map((participant, index) => ({ firstName: participant.firstName, lastName: participant.lastName, ...selection.contacts[index], email: selection.contacts[index].email.trim() })));
      if (checked && !checked.success) throw new Error(copy.invalidData);
      const body = { ...base, participants, ...(checked?.success ? { attendees: checked.data } : {}), buyerEmail: upgrade ? selection.buyerEmail.trim() : selection.contacts[0].email.trim(), locale, expectedTotalCents: quote!.totalCents };
      const fingerprint = JSON.stringify(body);
      if (attemptBody.current !== fingerprint) { attempt.current = null; attemptBody.current = fingerprint; }
      attempt.current ??= crypto.randomUUID();
      const response = await fetch("/api/commerce/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, checkoutAttemptId: attempt.current }) });
      const result = await response.json();
      if (!response.ok) {
        if (result.code === "request_expired" || result.code === "price_changed") attempt.current = null;
        if (result.code === "price_changed" && result.quote) { setQuote(result.quote); throw new Error(copy.priceChanged); }
        throw new Error((locale === "it" ? result.error : "") || copy.checkoutError);
      }
      const url = safeCommerceRedirect(result.url, window.location.origin);
      if (!url) throw new Error(copy.redirectError);
      window.location.assign(url);
    } catch (cause) { setError(cause instanceof Error && !/fetch|network|offline/i.test(cause.message) ? cause.message : copy.offline); }
    finally { submitting.current = false; setLoading(false); }
  }

  const available = catalog.available && catalog.availability._event !== 0 && offers.some((offer) => packageAvailable(catalog, offer.id, upgrade?.activityIds, now));
  const prices = offers.map((offer) => currentTier(offer.prices, now)?.amountCents).filter((value): value is number => value !== undefined);
  const future = Date.parse(catalog.event.date) > now;
  const canWaitlist = !upgrade && !available && future && catalog.config.waitlistEnabled;
  const canUpgrade = upgrade && (offers.some((offer) => offer.id !== upgrade.packageId && packageAvailable(catalog, offer.id, upgrade.activityIds, now)) || catalog.config.addons.some((addon) => !upgrade.activityIds.includes(addon.activityId) && activityAvailable(catalog, addon.activityId, now)));
  if (upgrade && !canUpgrade) return null;

  return <>
    {upgrade ? <div className="mt-6 rounded-[22px] border border-[#dedfd3] bg-white p-5"><p className={styles.eyebrow}>{copy.complete}</p><p className="my-3 text-sm leading-6 text-[#64705f]">{copy.upgradeIntro}</p><button ref={trigger} className={styles.button} type="button" onClick={() => show()}><Plus className="h-4 w-4" /> {copy.upgradeAction}</button></div>
      : <div><p className={styles.eyebrow}>{copy.chooseExperience}</p>{available && prices.length ? <p className={styles.price}><span className="mr-2 text-xs font-normal tracking-normal text-[#7c8676]">{copy.from}</span>{money(Math.min(...prices), locale)}</p> : <p className="my-3 text-sm font-semibold">{copy.unavailableOffers}</p>}<button ref={trigger} className={styles.button} type="button" disabled={!available && !canWaitlist} onClick={() => show(!available)}>{available ? copy.chooseTickets : canWaitlist ? copy.joinWaitlist : copy.closed}<ArrowRight className="h-4 w-4" /></button><p className={`${styles.muted} mt-2 text-center`}>{available ? copy.purchaseHint : canWaitlist ? copy.waitlistHint : copy.closedHint}</p></div>}

    <dialog ref={dialog} className={styles.dialog} aria-labelledby={`commerce-title-${catalog.event.id}`} onCancel={(event) => { if (submitting.current) event.preventDefault(); }} onClose={() => { setOpen(false); opened.current = false; document.body.style.overflow = previousOverflow.current; trigger.current?.focus(); }} onClick={(event) => { if (event.target === event.currentTarget && !submitting.current) dialog.current?.close(); }}>
      <div className={styles.content}>
        <div className={styles.header}><div><p className={styles.eyebrow}>Meraki Experience</p><h2 id={`commerce-title-${catalog.event.id}`} className={styles.title}>{waitlist ? copy.waitlistTitle : upgrade ? copy.upgradeTitle : copy.title}</h2><p className={`${styles.muted} mt-2`}>{catalog.event.title}</p></div><button type="button" className={styles.close} disabled={loading} aria-label={copy.close} onClick={() => dialog.current?.close()}><X className="h-5 w-5" /></button></div>
        <div className={styles.scrollArea} data-checkout-scroll>
        {waitlistSaved ? <div role="status" className={styles.success}><Check className="mr-2 inline h-5 w-5" /> {copy.waitlistSaved}</div> : <form className={styles.stack} onSubmit={submit}>
          {!waitlist && !upgrade && <label className={styles.quantity}><span className={styles.label}> {copy.quantity}<span className={`${styles.muted} block font-normal`}>{copy.personalTicket}</span></span><select aria-label={copy.quantityLabel} disabled={loading} value={selection.participants.length} onChange={(event) => { const quantity = Number(event.target.value); setQuote(null); setSelection((value) => ({ ...value, participants: Array.from({ length: quantity }, (_, index) => value.participants[index] || initial()), contacts: Array.from({ length: quantity }, (_, index) => value.contacts[index] || emptyCheckoutContact(locale)) })); }}>{Array.from({ length: 10 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}</select></label>}
          {selection.participants.map((participant, index) => {
            const selectedPackage = catalog.config.packages.find((offer) => offer.id === participant.packageId);
            const includedIds = new Set([...(upgrade?.activityIds || []), ...(selectedPackage?.activityIds || []), ...catalog.config.addons.filter((addon) => participant.addonIds.includes(addon.id)).map((addon) => addon.activityId)]);
            const menuActivities = catalog.config.activities.filter((activity) => includedIds.has(activity.id) && activity.menuOptions.length && !upgrade?.activityIds.includes(activity.id));
            return <fieldset key={index} className={styles.person} disabled={loading}>
              <legend>{waitlist ? copy.yourData : upgrade ? copy.yourTicket : `${copy.participant} ${index + 1}`}</legend>
              <div className={styles.fields}><label className={styles.label}>{copy.firstName}<input className={styles.input} name={`firstName-${index}`} value={participant.firstName} onChange={(event) => updateParticipant(index, { firstName: event.target.value })} autoComplete={index === 0 ? "given-name" : "off"} required maxLength={100} readOnly={!!upgrade} /></label><label className={styles.label}>{copy.lastName}<input className={styles.input} name={`lastName-${index}`} value={participant.lastName} onChange={(event) => updateParticipant(index, { lastName: event.target.value })} autoComplete={index === 0 ? "family-name" : "off"} required maxLength={100} readOnly={!!upgrade} /></label></div>
              <CheckoutContactFields locale={locale} prefix={`participant-${index}`} value={upgrade ? { ...emptyCheckoutContact(locale), email: selection.buyerEmail } : selection.contacts[index]} onChange={(changes) => upgrade ? setSelection((value) => ({ ...value, buyerEmail: changes.email ?? value.buyerEmail })) : updateContact(index, changes)} disabled={loading} emailOnly={waitlist || !!upgrade} originalEmail={!!upgrade} group={selection.participants.length > 1} />
              <h3 className={styles.sectionTitle}>{waitlist ? copy.interest : copy.chooseFormula}</h3><div className={styles.options}>{offers.map((offer) => {
                const tier = currentTier(offer.prices, now);
                const valid = packageAvailable(catalog, offer.id, upgrade?.activityIds, now);
                const savings = packageSavings(catalog.config, offer.id, now);
                return <div key={offer.id}><label className={styles.option}><input type="radio" name={`package-${index}`} value={offer.id} checked={participant.packageId === offer.id} disabled={!waitlist && !valid} required onChange={() => updateParticipant(index, { packageId: offer.id, addonIds: participant.addonIds.filter((id) => !catalog.config.addons.some((addon) => addon.id === id && offer.activityIds.includes(addon.activityId))), menuChoices: {} })} /><span className={styles.optionBody}><span className={styles.optionTop}><span>{offer.name}</span><span>{upgrade && offer.id === upgrade.packageId ? copy.purchased : tier ? money(tier.amountCents, locale) : "—"}</span></span><span className={`${styles.muted} block`}>{offer.description || offer.activityIds.map((id) => catalog.config.activities.find((activity) => activity.id === id)?.name).filter(Boolean).join(" + ")}</span>{!waitlist && tier && !(upgrade && offer.id === upgrade.packageId) && <span className={`${styles.muted} block`}>{tier.label}{tier.endsAt ? ` · ${copy.until} ${deadline(tier.endsAt, locale)}` : ""}</span>}{!valid && !waitlist ? <span className={`${styles.muted} block`}>{copy.unavailable}</span> : null}{!upgrade && savings > 0 ? <span className={styles.badge}>{copy.save} {money(savings, locale)}</span> : null}{upgrade && offer.id === upgrade.packageId ? <span className={styles.badge}>{copy.currentFormula}</span> : null}</span></label>{!valid && !waitlist && !upgrade && catalog.config.waitlistEnabled && future && <button type="button" className={styles.smallButton} onClick={() => {
                  setSelection((value) => ({ ...value, participants: [{ ...value.participants[index], packageId: offer.id, addonIds: [], menuChoices: {} }], contacts: [value.contacts[index]] })); setWaitlist(true); setQuote(null); setError("");
                }}>{copy.notify} {offer.name}</button>}</div>;
              })}</div>
              {!waitlist && catalog.config.addons.some((addon) => !selectedPackage?.activityIds.includes(addon.activityId) && !upgrade?.activityIds.includes(addon.activityId)) && <div className={styles.addon}><h3 className={styles.sectionTitle}>{copy.complete}</h3><div className={styles.options}>{catalog.config.addons.filter((addon) => !selectedPackage?.activityIds.includes(addon.activityId) && !upgrade?.activityIds.includes(addon.activityId)).map((addon) => {
                const activity = catalog.config.activities.find((item) => item.id === addon.activityId);
                const closed = !activityAvailable(catalog, addon.activityId, now);
                return <label key={addon.id} className={styles.option}><input type="checkbox" name={`addon-${index}-${addon.id}`} checked={participant.addonIds.includes(addon.id)} disabled={closed} onChange={(event) => {
                  const menuChoices = { ...participant.menuChoices };
                  if (!event.target.checked) delete menuChoices[addon.activityId];
                  updateParticipant(index, { addonIds: event.target.checked ? [...participant.addonIds, addon.id] : participant.addonIds.filter((id) => id !== addon.id), menuChoices });
                }} /><span className={styles.optionBody}><span className={styles.optionTop}><span>{addon.name}</span><span>+{money(addon.amountCents, locale)}</span></span><span className={`${styles.muted} block`}>{closed ? copy.unavailable : activity?.salesEnd ? `${copy.bookBy} ${deadline(activity.salesEnd, locale)}` : copy.optionalExtra}</span></span></label>;
              })}</div></div>}
              {!waitlist && menuActivities.map((activity) => <label key={activity.id} className={`${styles.label} mt-4`}>{activity.name}: {copy.chooseMenu}<select className={styles.input} value={participant.menuChoices[activity.id] || ""} required onChange={(event) => updateParticipant(index, { menuChoices: { ...participant.menuChoices, [activity.id]: event.target.value } })}><option value="">{copy.selectMenu}</option>{activity.menuOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>)}
            </fieldset>;
          })}
          {!waitlist && <div className={styles.summary} aria-live="polite">{quoteLoading ? <p className={styles.muted}>{copy.checkingTotal}</p> : quote ? <><ul>{quote.lines.map((line, index) => <li key={index}><span>{line.quantity > 1 ? `${line.quantity} × ` : ""}{line.label}</span><span>{money(line.totalCents, locale)}</span></li>)}</ul><div className={styles.total}><span>{upgrade ? copy.difference : copy.total}</span><span>{money(quote.totalCents, locale)}</span></div><p className={`${styles.muted} mt-2`}>{copy.holdHint}</p></> : <p className={styles.muted}>{copy.selectionHint}</p>}{quoteError && <><p role="alert" className={styles.error}>{quoteError}</p><button type="button" className={styles.smallButton} onClick={() => setQuoteRetry((value) => value + 1)}>{copy.recheck}</button></>}</div>}
          {error && <p role="alert" className={styles.error}>{error}</p>}
          <button type="submit" className={styles.button} disabled={loading || (!waitlist && (!quote || quoteLoading))}>{loading ? <><LoaderCircle className="h-4 w-4 animate-spin" /> {waitlist ? copy.joining : copy.openingPayment}</> : waitlist ? copy.waitlistSubmit : <><LockKeyhole className="h-4 w-4" /> {upgrade ? copy.upgradePay : copy.continuePay}</>}</button>
          <p className={`${styles.muted} text-center`}>{waitlist ? copy.waitlistPrivacy : <><Ticket className="mr-1 inline h-3.5 w-3.5" />{copy.securePayment}</>}</p>
        </form>}
        </div>
      </div>
    </dialog>
  </>;
}
