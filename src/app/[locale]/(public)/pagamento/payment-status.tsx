"use client";

import { useCallback, useEffect, useState } from "react";
import { Link } from "@/i18n/routing";
import { CircleCheck, LoaderCircle, Ticket, TriangleAlert } from "lucide-react";
import NextLink from "next/link";
import { paymentViewCopy } from "@/lib/tickets/view-copy";

type Status = "processing" | "awaiting_payment" | "ready" | "expired" | "failed" | "invalid" | "refunded" | "refund_pending" | "unavailable";
type ReadyTicket = { id: string; url: string; title?: string; name?: string };

function readyTickets(value: unknown): ReadyTicket[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 10).flatMap((item) => {
    if (!item || typeof item !== "object" || typeof item.id !== "string" || typeof item.url !== "string" || !/^\/(it|en|de|es)\/biglietto\/[0-9a-f-]{36}\?token=[a-z0-9_-]{1,256}$/i.test(item.url)) return [];
    return [{ id: item.id, url: item.url, ...(typeof item.title === "string" ? { title: item.title } : {}), ...(typeof item.name === "string" ? { name: item.name } : {}) }];
  });
}

export function PaymentStatus({ sessionId, locale = "it" }: { sessionId: string; locale?: string }) {
  const t = paymentViewCopy[locale as keyof typeof paymentViewCopy] || paymentViewCopy.it;
  const [status, setStatus] = useState<Status>("processing");
  const [attempts, setAttempts] = useState(0);
  const [requestId, setRequestId] = useState(0);
  const [tickets, setTickets] = useState<ReadyTicket[]>([]);
  const check = useCallback(async (signal: AbortSignal) => {
    try {
      const response = await fetch(`/api/checkout/status?session_id=${encodeURIComponent(sessionId)}`, { cache: "no-store", signal });
      const result = await response.json();
      if (!response.ok && result.status !== "invalid") {
        setStatus("unavailable");
        return "unavailable";
      }
      if (result.status === "ready" && Array.isArray(result.tickets)) {
        const passes = readyTickets(result.tickets);
        if (passes.length !== result.tickets.length || !passes.length) { setStatus("unavailable"); return "unavailable"; }
        setTickets(passes);
        setStatus("ready");
        return "ready";
      }
      if (result.status === "ready" && typeof result.url === "string" && /^\/(it|en|de|es)\/biglietto\//.test(result.url)) {
        window.location.replace(result.url);
        return "ready";
      }
      const allowed: Status[] = ["processing", "awaiting_payment", "ready", "expired", "failed", "invalid", "refunded", "refund_pending"];
      const next: Status = allowed.includes(result.status) ? result.status : "unavailable";
      setStatus(next);
      return next;
    } catch {
      if (!signal.aborted) setStatus("unavailable");
      return "unavailable";
    }
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    const controller = new AbortController();
    let pollCount = 0;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const result = await check(controller.signal);
      if (controller.signal.aborted) return;
      pollCount += 1;
      setAttempts(pollCount);
      if (pollCount < 20 && ["processing", "awaiting_payment", "unavailable", "refund_pending"].includes(result)) timer = setTimeout(poll, 3000);
    };
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [sessionId, requestId, check]);

  const current = sessionId ? status : "invalid";
  const waiting = current === "processing" || current === "awaiting_payment";
  const pair = t[current];
  const message = { title: current === "ready" && tickets.length > 1 ? t.readyMany : pair[0], text: current === "ready" ? (tickets.length > 1 ? t.readyManyText : tickets.length ? pair[1] : t.redirect) : pair[1] };
  return (
    <section className="mx-auto flex min-h-[65dvh] max-w-lg items-center px-5 py-8">
      <div className="w-full rounded-[28px] border border-[#e3e5dd] bg-white p-7 text-center shadow-[0_12px_40px_-24px_rgba(24,37,31,0.2)] sm:p-10">
        <div className="mx-auto mb-7 flex h-20 w-20 items-center justify-center rounded-[28px] bg-[#f0eadf] text-[#977a4b]">
          {waiting && attempts < 20 ? <LoaderCircle className="h-8 w-8 animate-spin" aria-hidden="true" />
            : current === "ready" ? <CircleCheck className="h-8 w-8" aria-hidden="true" />
            : current === "refunded" ? <Ticket className="h-8 w-8" aria-hidden="true" />
            : <TriangleAlert className="h-8 w-8" aria-hidden="true" />}
        </div>
        {current === "ready" && tickets.length > 0 && <ul className="mt-7 space-y-3 text-left">{tickets.map((ticket, index) => <li key={ticket.id}><NextLink href={ticket.url} prefetch={false} className="flex min-h-16 items-center justify-between gap-3 rounded-2xl border border-[#dfe4d9] bg-[#f4f6ee] px-4 py-3"><span className="min-w-0"><span className="block text-sm font-semibold text-[#263a2c]">{ticket.name || `${t.participant} ${index + 1}`}</span><span className="mt-1 block text-xs leading-5 text-[#73816c]">{ticket.title || t.ticket}</span></span><Ticket className="h-5 w-5 shrink-0 text-[#967f53]" aria-hidden="true" /></NextLink></li>)}</ul>}
        <div role="status" aria-live="polite">
          <h1 className="text-[28px] font-bold leading-tight tracking-tight text-[#18251f]">{message.title}</h1>
          <p className="mt-4 text-sm leading-7 text-[#67716b]">{message.text}</p>
        </div>
        {(waiting && attempts >= 20 || current === "unavailable" || current === "refund_pending") && (
          <button onClick={() => { setAttempts(0); setRequestId((value) => value + 1); }} className="mt-7 min-h-14 w-full rounded-2xl bg-[#18251f] px-6 py-3 font-semibold text-white">{t.retry}</button>
        )}
        <Link href="/eventi" className="mt-6 block text-sm font-semibold underline underline-offset-4">{t.events}</Link>
        <Link href="/profilo/assistenza" className="mt-4 block text-sm font-semibold underline underline-offset-4">{t.contact}</Link>
      </div>
    </section>
  );
}
