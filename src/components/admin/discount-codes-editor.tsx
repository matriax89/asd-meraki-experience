"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Pencil, Plus, Save, Tag, X } from "lucide-react";
import { loadCommerceDiscountsAdmin, saveCommerceDiscountAdmin } from "@/app/api/admin/commerce/actions";
import { CustomSelect } from "@/components/ui/custom-select";
import { DateTimeField } from "@/components/admin/date-time-field";
import { EuroInput } from "@/components/admin/euro-input";
import { WizardSteps } from "@/components/admin/wizard-steps";
import { fromRomeInput, toRomeInput } from "@/lib/commerce/rome-time";
import { discountSchema } from "@/lib/commerce/discounts";
import type { CommerceConfig } from "@/lib/commerce/types";
import type { CommerceDiscountCode, CommerceDiscountCodeInput } from "@/lib/commerce/discounts";

const input = "min-h-11 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";
const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 disabled:opacity-50";
const primary = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#263b2d] px-5 text-sm font-bold text-white disabled:opacity-50";
const money = (cents: number) => (cents / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" });
const steps = [{ title: "Codice e sconto", description: "Scegli il codice da condividere e il valore della promozione." }, { title: "Prodotti e limiti", description: "Scegli cosa scontare, gli scaglioni ammessi e i limiti di utilizzo." }, { title: "Riepilogo", description: "Verifica la promozione. Il codice viene salvato soltanto alla conferma." }] as const;
const emptyDiscount = (): CommerceDiscountCodeInput => ({ code: "", name: "", active: true, startsAt: null, endsAt: null, discountType: "percentage", discountValue: 10, minSubtotalCents: 0, maxUses: null, targetType: "order", targetIds: [], allowedTierIds: [] });
const rowToInput = (row: CommerceDiscountCode): CommerceDiscountCodeInput => ({ id: row.id, code: row.code, name: row.name, active: row.active, startsAt: row.starts_at, endsAt: row.ends_at, discountType: row.discount_type, discountValue: row.discount_value, minSubtotalCents: row.min_subtotal_cents, maxUses: row.max_uses, targetType: row.target_type, targetIds: row.target_ids, allowedTierIds: row.allowed_tier_ids });
const when = (value: string | null) => value ? new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", dateStyle: "short", timeStyle: "short", hourCycle: "h23" }).format(new Date(value)) : null;

export function DiscountCodesEditor({ eventId, config, initialDiscounts, loadError }: { eventId: string; config: CommerceConfig | null; initialDiscounts: CommerceDiscountCode[]; loadError?: string }) {
  const [discounts, setDiscounts] = useState(initialDiscounts);
  const [draft, setDraft] = useState<CommerceDiscountCodeInput | null>(null);
  const [step, setStep] = useState(0);
  const [maxStep, setMaxStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ success: boolean; text: string } | null>(loadError ? { success: false, text: loadError } : null);
  const panels = useRef<(HTMLFieldSetElement | null)[]>([]);
  const heading = useRef<HTMLHeadingElement>(null);
  const navigation = useRef<HTMLDivElement>(null);
  const editing = draft !== null;
  useEffect(() => { if (!editing) return; navigation.current?.focus({ preventScroll: true }); navigation.current?.scrollIntoView?.({ block: "start", behavior: "smooth" }); }, [step, editing]);
  const invalidControl = useRef<HTMLInputElement | null>(null);
  const [validationRequest, setValidationRequest] = useState(0);
  useEffect(() => { const control = invalidControl.current; if (!control || control.closest("[hidden]")) return; invalidControl.current = null; control.focus(); control.reportValidity(); }, [step, validationRequest]);
  const id = useId();
  const [dateDrafts, setDateDrafts] = useState({ startsAt: "", endsAt: "" });
  const [dateErrors, setDateErrors] = useState<Record<string, string>>({});
  const advanced = Boolean(config?.enabled);
  const options = (target: CommerceDiscountCodeInput["targetType"]) => target === "package" ? config?.packages || [] : target === "activity" ? config?.activities || [] : target === "addon" ? config?.addons || [] : [];
  const tierOptions = [...new Map((config?.packages || []).flatMap((pkg) => pkg.prices.map((tier) => [tier.id, { id: tier.id, name: tier.label }] as const))).values()];
  const targetLabel = (discount: CommerceDiscountCodeInput) => discount.targetType === "order" ? "Intero ordine" : `${discount.targetType === "package" ? "Formule" : discount.targetType === "activity" ? "Attività, anche nei pacchetti" : "Aggiunte"}: ${discount.targetIds.map((targetId) => options(discount.targetType).find((option) => option.id === targetId)?.name || targetId).join(", ")}`;
  const begin = (value: CommerceDiscountCodeInput) => {
    setDraft(value); setStep(0); setMaxStep(0); setMessage(null); setDateErrors({}); setDateDrafts({ startsAt: toRomeInput(value.startsAt), endsAt: toRomeInput(value.endsAt) });
    heading.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  };
  const validate = (targetStep: number) => {
    if (!draft) return false;
    const panel = panels.current[targetStep];
    if (panel) {
      const previous = panel.disabled; panel.disabled = false;
      const invalid = [...panel.querySelectorAll<HTMLInputElement>("input, textarea")].find((control) => !control.validity.valid);
      panel.disabled = previous;
      if (invalid) { setStep(targetStep); setMaxStep((current) => Math.max(current, targetStep)); setMessage({ success: false, text: "Completa o correggi il campo indicato prima di continuare." }); invalidControl.current = invalid; setValidationRequest((current) => current + 1); return false; }
    }
    const parsed = discountSchema.safeParse(draft);
    const issues = parsed.success ? [] : parsed.error.issues.filter((issue) => targetStep === 0 ? ["code", "name", "discountType", "discountValue"].includes(String(issue.path[0])) : !["code", "name", "discountType", "discountValue"].includes(String(issue.path[0])));
    if (issues.length || targetStep === 1 && Object.values(dateErrors).some(Boolean)) {
      setStep(targetStep); setMaxStep((current) => Math.max(current, targetStep));
      setMessage({ success: false, text: issues.map((issue) => issue.message).join(" · ") || "Correggi le date indicate. Gli orari sono riferiti all’Italia." }); return false;
    }
    return true;
  };
  const navigate = (next: number) => { if (busy || next === step) return; if (next > step) for (let current = step; current < next; current++) if (!validate(current)) return; setStep(next); setMaxStep((current) => Math.max(current, next)); setMessage(null); };
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (busy || !draft) return;
    if ((event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") !== "confirm") { if (step < 2) navigate(step + 1); return; }
    if (step !== 2 || !validate(0) || !validate(1)) return;
    const parsed = discountSchema.safeParse(draft); if (!parsed.success) return;
    setBusy(true); setMessage(null);
    try {
      const result = await saveCommerceDiscountAdmin(eventId, parsed.data);
      if (!result.success) { setMessage({ success: false, text: result.error || "Codice non salvato." }); return; }
      const refreshed = await loadCommerceDiscountsAdmin(eventId);
      if (refreshed.success) setDiscounts(refreshed.discounts);
      else if (result.discount) setDiscounts((current) => [...current.filter((row) => row.id !== result.discount.id), { ...result.discount, reserved_uses: current.find((row) => row.id === result.discount.id)?.reserved_uses || 0, redeemed_uses: current.find((row) => row.id === result.discount.id)?.redeemed_uses || 0 }]);
      setDraft(null); setMessage({ success: true, text: refreshed.success ? "Codice salvato. Gli acquisti già riservati mantengono il preventivo confermato." : "Codice salvato. Ricarica per aggiornare i conteggi di utilizzo." });
    } catch { setMessage({ success: false, text: "Connessione interrotta. Salvataggio non confermato: riprova." }); }
    finally { setBusy(false); }
  };
  const toggle = async (row: CommerceDiscountCode) => {
    setBusy(true); setMessage(null);
    try { const result = await saveCommerceDiscountAdmin(eventId, { ...rowToInput(row), active: !row.active }); if (result.success) { setDiscounts((current) => current.map((item) => item.id === row.id ? { ...item, active: !row.active } : item)); setMessage({ success: true, text: row.active ? "Codice disattivato per i nuovi acquisti. Le prenotazioni già confermate restano valide." : "Codice riattivato. Restano validi gli altri limiti e le date impostate." }); } else setMessage({ success: false, text: result.error || "Aggiornamento non confermato." }); }
    catch { setMessage({ success: false, text: "Connessione interrotta. Aggiornamento non confermato." }); }
    finally { setBusy(false); }
  };
  return <section aria-labelledby={`${id}-heading`} className="min-w-0 space-y-5 rounded-3xl border border-slate-200 bg-white p-5 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 ref={heading} id={`${id}-heading`} className="scroll-mt-24 text-xl font-bold text-slate-900"><Tag className="mr-2 inline h-5 w-5" aria-hidden="true" /> Codici sconto</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Una promozione per ordine. Puoi scontare una sola attività anche quando è compresa in un pacchetto. Le formule e gli scaglioni disponibili sono quelli già salvati.</p></div>{!draft && <button type="button" disabled={busy || Boolean(loadError)} className={primary} onClick={() => begin(emptyDiscount())}><Plus className="h-4 w-4" /> Crea codice sconto</button>}</div>
    {message && <p role="status" className={`rounded-xl p-3 text-sm leading-6 ${message.success ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>{message.text}</p>}
    {!draft && (discounts.length ? <ul className="divide-y divide-slate-100">{discounts.map((row) => <li key={row.id} className="flex flex-wrap items-center justify-between gap-4 py-4"><div className="min-w-0 space-y-1"><p className="break-all font-bold text-slate-900">{row.code} <span className={`ml-2 rounded-full px-2 py-1 text-xs ${row.active ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{row.active ? "Attivo" : "Disattivato"}</span></p><p className="text-sm text-slate-600">{row.name} · {row.discount_type === "percentage" ? `${row.discount_value}%` : money(row.discount_value)}</p><p className="text-xs leading-5 text-slate-500">{targetLabel(rowToInput(row))} · Utilizzi confermati: {row.redeemed_uses}{row.max_uses !== null ? ` / ${row.max_uses}` : ""} · Riservati: {row.reserved_uses}</p><p className="text-xs text-slate-500">Da {when(row.starts_at) || "subito"} fino a {when(row.ends_at) || "nessuna scadenza"}</p></div><div className="flex flex-wrap gap-2"><button type="button" disabled={busy} className={button} onClick={() => begin(rowToInput(row))}><Pencil className="h-4 w-4" /> Modifica {row.code}</button><button type="button" disabled={busy} className={button} onClick={() => void toggle(row)}>{row.active ? "Disattiva" : "Riattiva"} {row.code}</button></div></li>)}</ul> : !loadError && <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Nessun codice sconto creato per questo evento.</p>)}
    {draft && <form noValidate onSubmit={save} onKeyDown={(event) => { if (event.key === "Enter" && (event.target as HTMLElement).tagName === "INPUT") { event.preventDefault(); if (step < 2) navigate(step + 1); } }} className="min-w-0 space-y-5">
      <div ref={navigation} tabIndex={-1} className="scroll-mt-24 outline-none"><WizardSteps steps={steps} currentStep={step} maxStep={maxStep} onStepChange={navigate} disabled={busy} label="Crea o modifica un codice sconto" /></div>
      <fieldset ref={(element) => { panels.current[0] = element; }} data-discount-step={0} hidden={step !== 0} disabled={busy || step !== 0} className={step === 0 ? "grid min-w-0 gap-4 sm:grid-cols-2" : "hidden"}>
        <label className="space-y-1.5 text-sm font-semibold text-slate-700"><span>Codice da condividere *</span><input autoComplete="off" required maxLength={50} pattern="[A-Za-z0-9_-]{1,50}" value={draft.code} onChange={(event) => setDraft({ ...draft, code: event.target.value.toUpperCase() })} className={input} placeholder="MERAKI10" /><span className="block text-xs font-normal text-slate-500">Da 1 a 50 lettere, numeri, trattini o underscore.</span></label>
        <label className="space-y-1.5 text-sm font-semibold text-slate-700"><span>Nome interno *</span><input required maxLength={120} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className={input} placeholder="Promozione partecipanti workshop" /></label>
        <label className="space-y-1.5 text-sm font-semibold text-slate-700"><span>Tipo di sconto</span><CustomSelect aria-label="Tipo di sconto" disabled={busy || step !== 0} value={draft.discountType} onChange={(event) => setDraft({ ...draft, discountType: event.target.value as CommerceDiscountCodeInput["discountType"], discountValue: event.target.value === "percentage" ? 10 : 1000 })} className={input}><option value="percentage">Percentuale</option><option value="fixed_amount">Importo fisso in euro</option></CustomSelect></label>
        <label className="space-y-1.5 text-sm font-semibold text-slate-700"><span>{draft.discountType === "percentage" ? "Percentuale (1–99%) *" : "Importo (€) *"}</span>{draft.discountType === "percentage" ? <input type="number" required min={1} max={99} step={1} value={draft.discountValue} onChange={(event) => setDraft({ ...draft, discountValue: Number(event.target.value) })} className={input} /> : <EuroInput required cents={draft.discountValue} onCentsChange={(discountValue) => setDraft({ ...draft, discountValue })} className={input} />}</label>
      </fieldset>
      <fieldset ref={(element) => { panels.current[1] = element; }} data-discount-step={1} hidden={step !== 1} disabled={busy || step !== 1} className={step === 1 ? "min-w-0 space-y-5" : "hidden"}>
        <label className="block space-y-1.5 text-sm font-semibold text-slate-700"><span>Applica lo sconto a</span><CustomSelect aria-label="Applica lo sconto a" disabled={busy || step !== 1} value={draft.targetType} onChange={(event) => setDraft({ ...draft, targetType: event.target.value as CommerceDiscountCodeInput["targetType"], targetIds: [] })} className={input}><option value="order">Intero ordine</option>{advanced && <><option value="package">Formule selezionate</option><option value="activity">Attività selezionate, anche nei pacchetti</option><option value="addon">Aggiunte selezionate</option></>}</CustomSelect></label>
        {draft.targetType !== "order" && <fieldset className="space-y-3 rounded-xl bg-slate-50 p-4"><legend className="text-sm font-semibold text-slate-800">Seleziona almeno un prodotto</legend>{options(draft.targetType).map((option) => <label key={option.id} className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" className="h-5 w-5 accent-[#263b2d]" checked={draft.targetIds.includes(option.id)} onChange={(event) => setDraft({ ...draft, targetIds: event.target.checked ? [...draft.targetIds, option.id] : draft.targetIds.filter((value) => value !== option.id) })} />{option.name}</label>)}</fieldset>}
        {draft.targetType === "activity" && <p className="rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-900">Nei pacchetti lo sconto usa solo il valore dell’attività selezionata, secondo la ripartizione dello scaglione. Le altre attività mantengono il loro prezzo.</p>}
        {advanced && tierOptions.length > 0 && <fieldset className="space-y-3 rounded-xl border border-slate-200 p-4"><legend className="text-sm font-semibold text-slate-800">Scaglioni ammessi · Early Bird, Standard, Last Minute</legend><label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" className="h-5 w-5 accent-[#263b2d]" checked={draft.allowedTierIds.length === 0} onChange={(event) => setDraft({ ...draft, allowedTierIds: event.target.checked ? [] : tierOptions.map((tier) => tier.id) })} />Tutti gli scaglioni, compreso Early Bird</label>{draft.allowedTierIds.length > 0 && tierOptions.map((tier) => <label key={tier.id} className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" className="h-5 w-5 accent-[#263b2d]" checked={draft.allowedTierIds.includes(tier.id)} onChange={(event) => { const next = event.target.checked ? [...draft.allowedTierIds, tier.id] : draft.allowedTierIds.filter((value) => value !== tier.id); if (!next.length) { setMessage({ success: false, text: "Seleziona almeno uno scaglione oppure scegli Tutti gli scaglioni." }); return; } setDraft({ ...draft, allowedTierIds: next }); }} />{tier.name}</label>)}</fieldset>}
        <div className="grid gap-4 sm:grid-cols-2"><label className="space-y-1.5 text-sm font-semibold text-slate-700"><span>Spesa minima dell’ordine (€)</span><EuroInput cents={draft.minSubtotalCents} onCentsChange={(minSubtotalCents) => setDraft({ ...draft, minSubtotalCents })} className={input} /></label><label className="space-y-1.5 text-sm font-semibold text-slate-700"><span>Numero massimo di utilizzi (vuoto = senza limite)</span><input type="number" min={1} max={1000000} step={1} value={draft.maxUses ?? ""} onChange={(event) => setDraft({ ...draft, maxUses: event.target.value === "" ? null : Number(event.target.value) })} className={input} /></label>{(["startsAt", "endsAt"] as const).map((field) => <DateTimeField key={field} label={field === "startsAt" ? "Valido da (vuoto = subito)" : "Valido fino a (vuoto = nessuna scadenza)"} value={dateDrafts[field]} disabled={busy || step !== 1} error={dateErrors[field]} onChange={(value) => { setDateDrafts((current) => ({ ...current, [field]: value })); try { const parsed = value === toRomeInput(draft[field]) ? draft[field] : fromRomeInput(value); setDraft({ ...draft, [field]: parsed }); setDateErrors((current) => ({ ...current, [field]: "" })); } catch (error) { setDateErrors((current) => ({ ...current, [field]: error instanceof Error ? error.message : "Data non valida" })); } }} />)}</div>
        <p className="text-xs leading-5 text-slate-500">Gli orari sono italiani (Europe/Rome). Gli utilizzi comprendono gli acquisti confermati e le prenotazioni ancora valide; i posti sbloccati dopo una scadenza tornano disponibili.</p>
      </fieldset>
      <fieldset ref={(element) => { panels.current[2] = element; }} data-discount-step={2} hidden={step !== 2} disabled={busy || step !== 2} className={step === 2 ? "min-w-0 space-y-4" : "hidden"}>
        <dl className="grid min-w-0 gap-4 rounded-2xl bg-slate-50 p-5 text-sm sm:grid-cols-2"><div><dt className="text-slate-500">Codice</dt><dd className="break-all font-bold text-slate-900">{draft.code}</dd></div><div><dt className="text-slate-500">Sconto</dt><dd className="font-bold text-slate-900">{draft.discountType === "percentage" ? `${draft.discountValue}%` : money(draft.discountValue)}</dd></div><div className="sm:col-span-2"><dt className="text-slate-500">Si applica a</dt><dd className="font-semibold text-slate-900">{targetLabel(draft)}</dd></div><div><dt className="text-slate-500">Scaglioni ammessi</dt><dd className="font-semibold text-slate-900">{draft.allowedTierIds.length ? draft.allowedTierIds.map((tierId) => tierOptions.find((tier) => tier.id === tierId)?.name || tierId).join(", ") : "Tutti, compreso Early Bird"}</dd></div><div><dt className="text-slate-500">Spesa minima</dt><dd className="font-semibold text-slate-900">{money(draft.minSubtotalCents)}</dd></div><div><dt className="text-slate-500">Numero massimo di utilizzi</dt><dd className="font-semibold text-slate-900">{draft.maxUses ?? "Senza limite"}</dd></div><div><dt className="text-slate-500">Validità · ora italiana</dt><dd className="font-semibold text-slate-900">Da {when(draft.startsAt) || "subito"}<br />Fino a {when(draft.endsAt) || "nessuna scadenza"}</dd></div></dl>
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-800"><input type="checkbox" className="h-5 w-5 accent-[#263b2d]" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} />Attiva il codice dopo il salvataggio</label>
        <p className="rounded-xl border border-slate-200 p-4 text-sm leading-6 text-slate-600">Il codice vale per i nuovi acquisti di questo evento. Non è cumulabile con altri codici e non si applica agli upgrade. L’importo fisso viene distribuito una sola volta sui prodotti ammessi. Il pagamento finale deve essere almeno 0,50 €. Se lo sconto lo porta sotto questa soglia, il codice non viene applicato. Non crea credito né rimborsi sugli ordini precedenti.</p>
      </fieldset>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4"><button type="button" disabled={busy} className={button} onClick={() => { setDraft(null); setMessage(null); }}><X className="h-4 w-4" /> Annulla</button><div className="flex flex-wrap gap-2">{step > 0 && <button key="back" type="button" disabled={busy} className={button} onClick={() => navigate(step - 1)}><ArrowLeft className="h-4 w-4" /> Indietro</button>}{step < 2 ? <button key="next" type="button" disabled={busy} className={primary} onClick={() => navigate(step + 1)}>Avanti <ArrowRight className="h-4 w-4" /></button> : <button key="confirm" type="submit" value="confirm" disabled={busy} className={primary}><Save className="h-4 w-4" />{busy ? "Salvataggio…" : "Salva codice sconto"}</button>}</div></div>
    </form>}
  </section>;
}
