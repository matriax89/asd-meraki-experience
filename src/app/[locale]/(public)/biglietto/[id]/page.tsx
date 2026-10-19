import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { getLocalizedText } from "@/lib/i18n-utils";
import QRCode from "qrcode";
import { CalendarDays, Check, Download, MapPin, ScanLine, ShieldCheck, Ticket } from "lucide-react";
import { Link } from "@/i18n/routing";
import { RegisterTicket } from "@/components/meraki/register-ticket";
import { CommercePurchase } from "@/components/meraki/commerce-purchase";
import { getCommercePass } from "@/lib/commerce/server";
import { ticketViewCopy } from "@/lib/tickets/view-copy";
import { eventTravelCopy, eventTravelPath } from "@/lib/events/travel-link";

export const metadata: Metadata = {
  title: "Il tuo biglietto · Meraki",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function BigliettoPage({ params, searchParams }: {
  params: Promise<{ id: string; locale: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { id, locale } = await params;
  const t = ticketViewCopy[locale as keyof typeof ticketViewCopy] || ticketViewCopy.it;
  const { token } = await searchParams;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) || typeof token !== "string" || !/^[a-z0-9_-]{1,256}$/i.test(token)) notFound();

  // The unguessable token is the buyer's credential. Never expose a public
  // SELECT policy or retrieve a ticket by its ID alone.
  const { data: legacyTicket } = await createAdminClient()
    .from("tickets")
    .select("id,buyer_nome,buyer_cognome,qr_code,status,used_at,event:events(titolo,data_inizio,location,indirizzo,check_in_starts_at,slug,tipo,logistics,attivo)")
    .eq("id", id)
    .eq("qr_code", token)
    .single();
  const commerce = legacyTicket?.event ? null : await getCommercePass(id, token);
  const rights = commerce?.entitlements || [];
  const availableRights = rights.filter((right) => right.status === "available");
  const commerceStatus = commerce?.pass.status !== "paid" ? "refunded" : availableRights.length ? "paid" : rights.some((right) => right.status === "used") ? "used" : "refunded";
  const ticket = legacyTicket?.event ? legacyTicket : commerce ? {
    ...commerce.pass, event: commerce.event, status: commerceStatus,
    used_at: null,
  } : null;
  if (!ticket?.event || !ticket.qr_code) notFound();

  const event = ticket.event;
  const travelPath = eventTravelPath(event, locale);
  const travelCopy = eventTravelCopy[locale as keyof typeof eventTravelCopy] || eventTravelCopy.it;
  const title = getLocalizedText(event.titolo, locale);
  const date = new Date(event.data_inizio);
  const opening = event.check_in_starts_at ? new Date(event.check_in_starts_at) : null;
  const checkInOpening = opening && Number.isFinite(opening.getTime()) ? opening : null;
  const valid = ticket.status === "paid";
  const status = valid ? (commerce ? `${availableRights.length} ${availableRights.length === 1 ? t.accessOne : t.accessMany}` : t.valid) : ticket.status === "used" ? t.used : ticket.status === "refunded" ? t.refunded : t.pending;
  const qr = valid ? await QRCode.toDataURL(ticket.qr_code, { width: 640, margin: 4, errorCorrectionLevel: "M", color: { dark: "#111111", light: "#ffffff" } }) : null;

  return (
    <div className="mx-auto max-w-lg px-5 pb-5 pt-7 sm:px-8 sm:pt-10">
      <div className="mb-7 flex items-center justify-between gap-4">
        <div><p className="mb-2 text-[10px] font-bold uppercase tracking-[0.22em] text-[#8f784e]">{t.entry}</p><h1 className="text-[30px] font-bold tracking-tight text-[#18251f]">{t.title}</h1></div>
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#e3dfd3] bg-[#ece7dc] text-[#8f784e]"><Ticket className="h-5 w-5" aria-hidden="true" /></span>
      </div>
      <article className="overflow-hidden rounded-[28px] border border-[#e3e5dd] bg-white shadow-[0_14px_45px_-20px_rgba(24,37,31,0.2)]">
        <div className="relative overflow-hidden bg-[#182b21] p-7 text-[#f5f3ed]">
          <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full border-[28px] border-white/5" aria-hidden="true" />
          <p className="relative mb-7 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#cfb683]"><span className="h-1.5 w-1.5 rounded-full bg-current" /> Meraki Experience</p>
          <h2 className="relative max-w-[20ch] text-[26px] font-bold leading-tight tracking-tight">{title}</h2>
          <p className="mt-3 text-xs leading-5 text-[#c9d1ca]">{new Intl.DateTimeFormat("it-IT", { dateStyle: "long", timeZone: "Europe/Rome" }).format(date)}</p>
        </div>
        <div className="relative border-b border-dashed border-[#dddcd3] px-6 pb-7 pt-6">
          <span className="absolute -bottom-3 -left-3 h-6 w-6 rounded-full border border-[#e3e5dd] bg-[#f5f4f0]" aria-hidden="true" />
          <span className="absolute -bottom-3 -right-3 h-6 w-6 rounded-full border border-[#e3e5dd] bg-[#f5f4f0]" aria-hidden="true" />
          <p className={`mb-5 flex items-center justify-center gap-2 text-sm font-semibold ${valid ? "text-[#3d6c4b]" : "text-[#876e42]"}`}><span className={`h-2 w-2 rounded-full ${valid ? "bg-[#6d966d]" : "bg-[#c1a56c]"}`} />{status}</p>
          {qr ? <div className="text-center">
            <Image src={qr} alt={t.qrAlt} width={256} height={256} unoptimized className="mx-auto h-auto w-full max-w-60 rounded-xl bg-white" />
            <p className="mt-4 text-xs leading-5 text-[#7a837b]">{t.show}<br />{commerce ? t.multi : t.single}</p>
          </div> : <div className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-2xl bg-[#f7f7f2] px-5 text-center"><ShieldCheck className="h-10 w-10 text-[#a08c67]" /><p className="text-sm leading-6 text-[#67716b]">{ticket.status === "used" ? t.usedBody : ticket.status === "refunded" ? t.refundedBody : t.pendingBody}</p></div>}
        </div>
        <dl className="grid gap-5 p-6 text-sm">
          {commerce && <div><dt className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[#8a9289]">{t.package}</dt><dd className="font-semibold text-[#18251f]">{commerce.pass.package_name}</dd></div>}
          <div><dt className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[#8a9289]">{t.holder}</dt><dd className="break-words font-semibold text-[#18251f]">{[ticket.buyer_nome, ticket.buyer_cognome].filter(Boolean).join(" ") || t.participant}</dd></div>
          <div className="flex items-start gap-3"><CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-[#a28b60]" aria-hidden="true" /><div><dt className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[#8a9289]">{t.when}</dt><dd className="font-medium text-[#18251f]">{new Intl.DateTimeFormat("it-IT", { dateStyle: "long", timeStyle: "short", hourCycle: "h23", timeZone: "Europe/Rome" }).format(date)}</dd></div></div>
          {checkInOpening && <div className="flex items-start gap-3 rounded-2xl bg-[#f4efe5] p-4"><ScanLine className="mt-0.5 h-5 w-5 shrink-0 text-[#a28b60]" aria-hidden="true" /><div><dt className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[#8a784f]">{t.checkInOpens}</dt><dd className="font-semibold text-[#18251f]">{new Intl.DateTimeFormat("it-IT", { dateStyle: "long", timeStyle: "short", hourCycle: "h23", timeZone: "Europe/Rome" }).format(checkInOpening)}</dd></div></div>}
          {(event.location || event.indirizzo) && <div className="flex items-start gap-3"><MapPin className="mt-0.5 h-5 w-5 shrink-0 text-[#a28b60]" aria-hidden="true" /><div><dt className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[#8a9289]">{t.where}</dt><dd className="break-words font-medium text-[#18251f]">{[event.location, event.indirizzo].filter(Boolean).join(" · ")}</dd></div></div>}
          {ticket.used_at && <div className="flex gap-3 text-[#3d6c4b]"><Check className="h-5 w-5 shrink-0" aria-hidden="true" /><div><dt className="text-xs">{t.checkedIn}</dt><dd className="mt-1 text-sm font-medium">{new Intl.DateTimeFormat("it-IT", { dateStyle: "short", timeStyle: "short", hourCycle: "h23", timeZone: "Europe/Rome" }).format(new Date(ticket.used_at))}</dd></div></div>}
        </dl>
        {commerce && <section className="border-t border-[#eeeee5] px-6 pb-6 pt-5" aria-labelledby="ticket-accesses"><h3 id="ticket-accesses" className="mb-4 text-sm font-semibold">{t.accesses}</h3><ul className="space-y-3">{rights.map((right) => <li key={right.activity_id} className="flex items-start justify-between gap-3 rounded-2xl bg-[#f5f5ef] p-3.5"><div className="min-w-0"><p className="text-sm font-semibold">{right.activity_name}</p>{right.menu_choice && <p className="mt-1 text-xs text-[#73806d]">{t.menu}: {right.menu_choice}</p>}{right.used_at && <p className="mt-1 text-[11px] text-[#73806d]">{t.checkedIn}: {new Intl.DateTimeFormat("it-IT", { dateStyle: "short", timeStyle: "short", hourCycle: "h23", timeZone: "Europe/Rome" }).format(new Date(right.used_at))}</p>}</div><span className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[10px] font-semibold ${right.status === "available" ? "bg-[#e5edde] text-[#41663d]" : "bg-[#e9e7df] text-[#777b70]"}`}>{right.status === "available" ? t.available : right.status === "used" ? t.accessUsed : t.revoked}</span></li>)}</ul></section>}
      </article>
      <div className="mt-6 space-y-3">
        {travelPath && <a href={travelPath} className="flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-[#b5a07c] bg-[#f5f4f0] px-5 text-center text-sm font-semibold text-[#263a2c]"><MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />{travelCopy.action}</a>}
        <RegisterTicket locale={locale} ticket={{ id: ticket.id, token: ticket.qr_code, title, date: event.data_inizio, checkInStartsAt: event.check_in_starts_at || undefined, location: [event.location, event.indirizzo].filter(Boolean).join(" · "), status: valid ? "paid" : ticket.status === "used" ? "used" : ticket.status === "refunded" ? "refunded" : "pending" }} />
        {valid && <a href={qr!} download={`Meraki-${id}.png`} className="flex min-h-14 items-center justify-center gap-3 rounded-2xl bg-[#18251f] px-5 font-semibold text-white active:scale-[0.98]"><Download className="h-4 w-4" /> {t.download}</a>}
        <Link href="/biglietti" className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-[#dedfd5] px-4 text-sm font-semibold text-[#18251f]">{t.all}</Link>
      </div>
      {commerce?.config?.upgradesEnabled && commerce.pass.status === "paid" && <CommercePurchase eventId={commerce.pass.event_id} locale={locale} ended={false} upgrade={{ passId: commerce.pass.id, token: commerce.pass.qr_code, firstName: commerce.pass.buyer_nome, lastName: commerce.pass.buyer_cognome, packageId: commerce.pass.package_id, activityIds: rights.filter((right) => right.status !== "revoked").map((right) => right.activity_id) }} />}
      {valid && <details className="mt-5 rounded-2xl bg-[#eeede7] p-4 text-sm text-[#67716b]"><summary className="flex min-h-7 cursor-pointer items-center gap-2 font-medium"><ScanLine className="h-4 w-4" /> {t.manual}</summary><p className="mt-3 break-all font-mono text-xs">{ticket.qr_code}</p></details>}
      <p className="mt-5 px-2 text-center text-[11px] leading-5 text-[#8a9289]">{t.private}</p>
    </div>
  );
}
