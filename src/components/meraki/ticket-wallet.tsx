"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { walletCopy } from "./wallet-copy";
import { formatEventDate } from "@/lib/events/date-format";
import { ArrowRight, Check, ChevronRight, Link2, LoaderCircle, Mail, MapPin, QrCode, RefreshCw, Smartphone, Ticket, Trash2, WifiOff } from "lucide-react";
import { parseTicketLink, readWallet, WALLET_CHANGED_EVENT, WALLET_KEY, walletResponseTickets, walletTicketUrl, writeWallet, type WalletTicket } from "@/lib/tickets/wallet";

function isPast(ticket: WalletTicket) {
  // Keep tickets available for the whole event day (end time is not stored).
  const eventDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ticket.date));
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return ticket.status === "used" || ticket.status === "refunded" || ticket.status === "canceled" || eventDay < today;
}

function statusLabel(status: WalletTicket["status"], copy: ReturnType<typeof walletCopy>) {
  return status === "paid" ? copy.ready : status === "used" ? copy.used : status === "refunded" ? copy.refunded : status === "canceled" ? copy.canceled : copy.pending;
}

export function TicketWallet({ locale, siteOrigin }: { locale: string; siteOrigin: string }) {
  const copy = walletCopy(locale);
  const [tickets, setTickets] = useState<WalletTicket[]>([]);
  const [ready, setReady] = useState(false);
  const [filter, setFilter] = useState<"active" | "past">("active");
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState("");
  const [storageBlocked, setStorageBlocked] = useState(false);
  const [importing, setImporting] = useState(false);
  const [link, setLink] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [removed, setRemoved] = useState<WalletTicket | null>(null);
  const revision = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);
  const safeLocale = ["it", "en", "de", "es"].includes(locale) ? locale : "it";

  const persist = useCallback((next: WalletTicket[]) => {
    let saved = false;
    try { saved = writeWallet(window.localStorage, next); } catch { /* Private mode or storage quota. */ }
    setStorageBlocked(!saved);
    setTickets(next);
    revision.current++;
    return saved;
  }, []);

  const refresh = useCallback(async (saved: WalletTicket[]) => {
    if (!saved.length) return;
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    const requestedRevision = revision.current;
    setRefreshing(true);
    try {
      const response = await fetch("/api/tickets/wallet", {
        method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", referrerPolicy: "no-referrer",
        body: JSON.stringify({ locale: safeLocale, tickets: saved.map(({ id, token }) => ({ id, token })) }), signal: controller.signal,
      });
      if (!response.ok) throw new Error("refresh");
      const updated = walletResponseTickets(await response.json(), saved);
      if (!updated) throw new Error("response");
      if (controller.signal.aborted || requestedRevision !== revision.current) return;
      persist(updated);
      setNotice("");
    } catch {
      if (!controller.signal.aborted) setNotice(copy.refreshError);
    } finally {
      if (activeRequest.current === controller) setRefreshing(false);
    }
  }, [persist, safeLocale, copy]);

  useEffect(() => {
    const load = () => {
      try {
        const saved = readWallet(window.localStorage);
        setTickets(saved.tickets);
        setStorageBlocked(!saved.available);
        setReady(true);
        revision.current++;
        void refresh(saved.tickets);
      } catch {
        setStorageBlocked(true);
        setReady(true);
      }
    };
    const timer = window.setTimeout(load, 0);
    const sync = (event: StorageEvent) => { if (event.key === WALLET_KEY || event.key === null) load(); };
    window.addEventListener("storage", sync);
    window.addEventListener(WALLET_CHANGED_EVENT, load);
    return () => {
      window.clearTimeout(timer);
      activeRequest.current?.abort();
      window.removeEventListener("storage", sync);
      window.removeEventListener(WALLET_CHANGED_EVENT, load);
    };
  }, [refresh]);

  async function importTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setImportMessage("");
    const credential = parseTicketLink(link, window.location.origin, siteOrigin);
    if (!credential) {
      setImportMessage(copy.invalidLink);
      return;
    }
    setImporting(true);
    try {
      const response = await fetch("/api/tickets/wallet", {
        method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", referrerPolicy: "no-referrer",
        body: JSON.stringify({ locale: safeLocale, tickets: [credential] }),
      });
      if (!response.ok) throw new Error("network");
      const verified = walletResponseTickets(await response.json(), [credential])?.[0];
      if (!verified) {
        setImportMessage(copy.missingTicket);
        return;
      }
      // Cancel a refresh started before this import so it cannot overwrite it.
      activeRequest.current?.abort();
      setRefreshing(false);
      persist([verified, ...tickets.filter((ticket) => ticket.id !== verified.id)].slice(0, 50));
      setFilter(isPast(verified) ? "past" : "active");
      setLink("");
      setImportMessage(copy.imported);
    } catch {
      setImportMessage(copy.importError);
    } finally {
      setImporting(false);
    }
  }

  function removeTicket(ticket: WalletTicket) {
    activeRequest.current?.abort();
    setRefreshing(false);
    persist(tickets.filter((item) => item.id !== ticket.id));
    setRemoved(ticket);
    setConfirmRemove(null);
  }

  const active = tickets.filter((ticket) => !isPast(ticket));
  const past = tickets.filter(isPast);
  const visible = (filter === "active" ? active : past).slice().sort((a, b) => filter === "active" ? Date.parse(a.date) - Date.parse(b.date) : Date.parse(b.date) - Date.parse(a.date));

  const emptyWallet = ready && tickets.length === 0;
  const importPanel = <section aria-labelledby="meraki-wallet-import" className="my-6 rounded-[22px] border border-[#e3e0d7] bg-white p-5">
      <h2 id="meraki-wallet-import" className="mb-4 flex items-center gap-3 text-sm font-semibold"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#efeee7] text-[#a28b5e]"><Link2 aria-hidden="true" className="h-4 w-4" /></span>{copy.alreadyTicket}</h2>
      <form onSubmit={importTicket}><label htmlFor="meraki-ticket-link" className="mb-2 block text-xs leading-5 text-[#7f8275]">{copy.importLabel}</label><input id="meraki-ticket-link" type="text" inputMode="url" autoComplete="off" autoCorrect="off" spellCheck={false} maxLength={2048} value={link} onChange={(event) => setLink(event.target.value)} placeholder="https://…/biglietto/…" required aria-describedby={importMessage ? "meraki-import-message" : undefined} className="h-12 w-full min-w-0 rounded-xl border border-[#ddd9cd] bg-white px-3 text-sm outline-none placeholder:text-[#aaa99d] focus:border-[#bda16d] focus:ring-2 focus:ring-[#c2a36b]/20" /><button disabled={importing || refreshing || !ready} type="submit" className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#18251f] px-4 text-xs font-semibold text-white disabled:opacity-50">{importing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Ticket className="h-4 w-4" />}{importing ? copy.checking : copy.add}</button>{importMessage ? <p role="status" id="meraki-import-message" className="mt-3 text-xs leading-5 text-[#706e60]">{importMessage}</p> : null}</form>
    </section>;

  return <div className="mx-auto w-full max-w-3xl px-5 pb-12 pt-7 text-[#18251f] sm:px-8 sm:pt-10">
    <div className="mb-7 flex items-start justify-between gap-4">
      <div>
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.22em] text-[#8a7860]">{copy.eyebrow}</p>
        <h1 className="text-[32px] font-semibold leading-[1.14] tracking-[-0.055em] sm:text-[42px]">{copy.title}</h1>
        <p className="mt-3 text-sm leading-6 text-[#798078]">{copy.intro}</p>
      </div>
      <span className="mt-1 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#deddd5] bg-white text-[#a88c58]"><Ticket className="h-6 w-6" strokeWidth={1.5} /></span>
    </div>

    {emptyWallet ? <section aria-labelledby="meraki-wallet-guide" className="mb-6 rounded-[24px] border border-[#dfdfd2] bg-[#efeee7]/70 p-5 sm:p-6">
      <h2 id="meraki-wallet-guide" className="text-base font-semibold tracking-[-0.025em]">{copy.guideTitle}</h2>
      <ol className="mt-4 grid gap-4 sm:grid-cols-2">
        {[
          { title: copy.emailStepTitle, body: copy.emailStepBody, Icon: Mail },
          { title: copy.deviceStepTitle, body: copy.deviceStepBody, Icon: Smartphone },
        ].map(({ title, body, Icon }, index) => <li key={title} className="flex items-start gap-3">
          <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#223b2e] text-xs font-semibold text-white">{index + 1}</span>
          <div className="min-w-0"><p className="flex items-center gap-2 text-sm font-semibold"><Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-[#8d7549]" />{title}</p><p className="mt-1 text-xs leading-5 text-[#6c7468]">{body}</p></div>
        </li>)}
      </ol>
      <p className="mt-4 border-t border-[#ddded2] pt-4 text-xs leading-5 text-[#6c7468]">{copy.newDevice}</p>
    </section> : null}

    <div className="mb-6 flex gap-1 rounded-2xl bg-[#eae9e2] p-1" aria-label={copy.filter}>
      {([['active', copy.upcoming, active.length], ['past', copy.past, past.length]] as const).map(([value, label, count]) => <button key={value} type="button" onClick={() => setFilter(value)} aria-pressed={filter === value}
        className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-colors ${filter === value ? "bg-white text-[#18251f] shadow-sm" : "text-[#7a8078] hover:text-[#18251f]"}`}>
        {label}{ready && count > 0 ? <span className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] ${filter === value ? "bg-[#f1ece1] text-[#8e7240]" : "bg-[#dcded5]"}`}>{count}</span> : null}
      </button>)}
    </div>

    {storageBlocked ? <p role="status" className="mb-5 flex items-start gap-2 rounded-2xl bg-[#eee7d9] px-4 py-3 text-xs leading-5 text-[#715b34]"><Smartphone className="mt-0.5 h-4 w-4 shrink-0" />{copy.storageBlocked}</p> : null}
    {notice ? <p role="status" className="mb-5 flex items-start gap-2 rounded-2xl border border-[#ddd6c9] bg-white/70 px-4 py-3 text-xs leading-5 text-[#767669]"><WifiOff className="mt-0.5 h-4 w-4 shrink-0" />{notice}</p> : null}
    {removed ? <div role="status" className="mb-5 flex items-center justify-between gap-3 rounded-2xl bg-[#e7ede5] px-4 py-3 text-xs text-[#375a42]"><span>{copy.removed}</span><button type="button" className="min-h-10 shrink-0 font-bold underline underline-offset-4" onClick={() => { persist([removed, ...tickets.filter((ticket) => ticket.id !== removed.id)]); setRemoved(null); }}>{copy.undo}</button></div> : null}

    {emptyWallet ? importPanel : null}

    {!ready ? <div role="status" className="flex min-h-72 items-center justify-center rounded-[28px] border border-[#e9e7df] bg-white"><LoaderCircle className="h-6 w-6 animate-spin text-[#a88c58]" aria-hidden="true" /><span className="sr-only">{copy.loading}</span></div> : visible.length === 0 ? <section className="relative overflow-hidden rounded-[28px] border border-[#e8e6de] bg-white px-7 pb-9 pt-10 text-center">
      <div className="relative mx-auto mb-7 flex h-28 w-28 items-center justify-center rounded-full bg-[#f5f2e9]">
        <Ticket className="h-[58px] w-[58px] -rotate-[18deg] text-[#b89a62]" strokeWidth={1.15} />
        <span className="absolute -right-1 top-4 flex h-8 w-8 items-center justify-center rounded-full border-4 border-white bg-[#e9eee5]"><Check className="h-4 w-4 text-[#57745c]" strokeWidth={2.2} /></span>
      </div>
      <h2 className="text-[23px] font-semibold leading-tight tracking-[-0.04em]">{filter === "active" ? copy.emptyActiveTitle : copy.emptyPastTitle}</h2>
      <p className="mx-auto mt-4 max-w-[265px] text-sm leading-6 text-[#7c8178]">{filter === "active" ? copy.emptyActiveBody : copy.emptyPastBody}</p>
      <Link href={`/${safeLocale}/eventi`} className="mt-7 inline-flex min-h-12 items-center justify-center gap-3 rounded-2xl bg-[#18251f] px-6 text-sm font-semibold text-white transition-colors hover:bg-[#2c4033]">{copy.discover}<ArrowRight className="h-4 w-4" /></Link>
      <div className="mx-auto mt-8 max-w-[280px] border-t border-dashed border-[#e2dfd5] pt-5"><p className="flex items-center justify-center gap-1.5 text-[11px] text-[#99998c]"><Smartphone className="h-3.5 w-3.5" />{copy.personal}</p></div>
    </section> : <div className="space-y-4">
      <div className="flex items-center justify-between px-1"><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#93978b]">{`${visible.length} ${visible.length === 1 ? copy.experience : copy.experiences}`}</p><button type="button" onClick={() => void refresh(tickets)} disabled={refreshing || importing} className="inline-flex min-h-10 items-center gap-1.5 text-xs font-semibold text-[#8f784e] disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />{refreshing ? copy.refreshing : copy.refresh}</button></div>
      {visible.map((ticket) => {
        const date = new Date(ticket.date);
        return <article key={ticket.id} className="overflow-hidden rounded-[24px] border border-[#e8e6df] bg-white">
          <div className="flex gap-4 p-5">
            <div className="flex h-[76px] w-[62px] shrink-0 flex-col items-center justify-center rounded-[17px] bg-[#f3efe5] text-[#8f7546]"><span className="text-[11px] font-bold uppercase tracking-[0.1em]">{formatEventDate(date, locale, { month: "short" }).replace(".", "")}</span><span className="text-[30px] font-semibold leading-9 tracking-[-0.06em]">{formatEventDate(date, locale, { day: "2-digit" })}</span></div>
            <div className="min-w-0 flex-1"><p className={`mb-2 inline-flex rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-[0.06em] ${ticket.status === "paid" ? "bg-[#edf2e9] text-[#5e7855]" : "bg-[#f1eee6] text-[#8b8068]"}`}>{statusLabel(ticket.status, copy)}</p><h2 className="break-words text-base font-semibold leading-[1.35] tracking-[-0.025em]">{ticket.title}</h2><p className="mt-2 text-xs leading-5 text-[#8b8e80]"><span className="font-semibold">{copy.eventStarts}:</span> {formatEventDate(date, locale, { weekday: "short", hour: "2-digit", minute: "2-digit" })}</p>{ticket.checkInStartsAt ? <p className="mt-1 text-xs leading-5 text-[#8f7546]"><span className="font-semibold">{copy.checkInOpens}:</span> {new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Europe/Rome" }).format(new Date(ticket.checkInStartsAt))}</p> : null}{ticket.location ? <p className="mt-1.5 flex items-start gap-1.5 text-xs leading-5 text-[#8b8e80]"><MapPin className="mt-0.5 h-3 w-3 shrink-0" /><span className="line-clamp-2">{ticket.location}</span></p> : null}</div>
          </div>
          <div className="flex items-center justify-between border-t border-dashed border-[#e6e3da] px-5 py-2.5"><Link href={walletTicketUrl(ticket, safeLocale)} prefetch={false} referrerPolicy="no-referrer" className="flex min-h-11 flex-1 items-center gap-2 text-sm font-semibold text-[#8d7549]"><QrCode className="h-[18px] w-[18px]" />{ticket.status === "paid" ? copy.show : copy.open}<ChevronRight className="ml-auto h-4 w-4" /></Link><button type="button" onClick={() => setConfirmRemove(confirmRemove === ticket.id ? null : ticket.id)} aria-label={`${copy.remove}: ${ticket.title}`} aria-expanded={confirmRemove === ticket.id} className="ml-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[#a7a99b] hover:bg-[#f5f4f0]"><Trash2 className="h-4 w-4" /></button></div>
          {confirmRemove === ticket.id ? <div className="border-t border-[#eeeae0] bg-[#faf8f2] p-5"><p className="text-xs leading-5 text-[#7d806e]">{copy.confirmRemove}</p><div className="mt-3 flex gap-2"><button type="button" onClick={() => removeTicket(ticket)} className="min-h-11 rounded-xl bg-[#eae3d5] px-4 text-xs font-semibold text-[#6f5c38]">{copy.remove}</button><button type="button" onClick={() => setConfirmRemove(null)} className="min-h-11 rounded-xl px-4 text-xs font-semibold">{copy.undo}</button></div></div> : null}
        </article>;
      })}
    </div>}

    {!emptyWallet ? importPanel : null}
    <p className="mx-auto mt-5 max-w-sm px-3 text-center text-[10px] leading-[1.8] text-[#9b9d90]">{copy.deviceHint}</p>
  </div>;
}
