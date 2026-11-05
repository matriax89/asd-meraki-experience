import { ticketNominalCopy } from "@/lib/tickets/nominal-copy";

export function TicketPolicyNotice({ locale, className = "", insurance = true }: { locale: string; className?: string; insurance?: boolean }) {
  const copy = ticketNominalCopy(locale);
  return <aside aria-label={copy.title} className={`rounded-2xl border border-[#dfdfd2] bg-[#f5f4ef] p-4 text-xs leading-6 text-[#5c685e] ${className}`}>
    <p className="font-semibold text-[#18251f]">{copy.title}</p>
    <p className="mt-1">{copy.nominal}</p>
    {insurance && <p className="mt-2">{copy.insurance}</p>}
  </aside>;
}
