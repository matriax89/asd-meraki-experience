"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  Mail,
  RotateCcw,
  ScanLine,
  Search,
  TicketCheck,
  UserCheck,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { checkInTicket, resendTicketEmail, undoCheckInTicket } from "@/app/api/admin/biglietti/actions";
import { useModal } from "@/components/ui/modal-provider";
import { TicketScanner } from "./ticket-scanner";

interface Ticket {
  id: string;
  event_id: string;
  buyer_nome: string;
  buyer_cognome: string;
  buyer_email: string;
  qr_code: string;
  status: "pending" | "paid" | "used" | "refunded";
  used_at: string | null;
  custom_answers?: Array<{ label: string; value: string | boolean }>;
  events: {
    titolo: string;
    data_inizio: string;
  };
}

type ScannerEvent = {
  id: string;
  titolo: string;
  data_inizio: string;
  capacity: number | null;
  attivo: boolean | null;
};

export function TicketsClient({
  initialTickets,
  scannerEvents,
  logoUrl,
}: {
  initialTickets: Ticket[];
  scannerEvents: ScannerEvent[];
  logoUrl?: string;
}) {
  const router = useRouter();
  const { showConfirm } = useModal();
  const [isPending, startTransition] = useTransition();
  const [tickets, setTickets] = useState<Ticket[]>(initialTickets);
  const [query, setQuery] = useState("");
  const [openEvents, setOpenEvents] = useState<Set<string>>(() => {
    const firstPopulated = scannerEvents.find(event => initialTickets.some(ticket => ticket.event_id === event.id));
    return new Set(firstPopulated ? [firstPopulated.id] : scannerEvents[0] ? [scannerEvents[0].id] : []);
  });
  const refreshAfterScan = useCallback(() => router.refresh(), [router]);

  useEffect(() => setTickets(initialTickets), [initialTickets]);

  const normalizedQuery = query.trim().toLocaleLowerCase("it");
  const eventGroups = useMemo(() => scannerEvents.map(event => {
    const eventTickets = tickets.filter(ticket => ticket.event_id === event.id);
    const valid = eventTickets.filter(ticket => ticket.status === "paid" || ticket.status === "used");
    const entered = valid.filter(ticket => ticket.status === "used").length;
    const filteredTickets = normalizedQuery
      ? eventTickets.filter(ticket => [
          ticket.buyer_nome,
          ticket.buyer_cognome,
          ticket.buyer_email,
          ticket.qr_code,
        ].some(value => value?.toLocaleLowerCase("it").includes(normalizedQuery)))
      : eventTickets;
    return {
      event,
      tickets: filteredTickets,
      totalTickets: eventTickets.length,
      valid: valid.length,
      entered,
      missing: Math.max(valid.length - entered, 0),
    };
  }).filter(group => !normalizedQuery || group.tickets.length > 0), [normalizedQuery, scannerEvents, tickets]);

  const totals = useMemo(() => {
    const valid = tickets.filter(ticket => ticket.status === "paid" || ticket.status === "used");
    const entered = valid.filter(ticket => ticket.status === "used").length;
    return { participants: valid.length, entered, missing: Math.max(valid.length - entered, 0) };
  }, [tickets]);

  const toggleEvent = (eventId: string) => {
    setOpenEvents(current => {
      const next = new Set(current);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  };

  const handleCheckIn = (ticket: Ticket) => {
    const previous = tickets;
    setTickets(current => current.map(item => item.id === ticket.id
      ? { ...item, status: "used", used_at: new Date().toISOString() }
      : item));

    startTransition(async () => {
      const result = await checkInTicket(ticket.id);
      if (result.error) {
        setTickets(previous);
        toast.error("Check-in non riuscito", { description: result.error });
      } else {
        toast.success("Check-in completato", { description: `${ticket.buyer_nome} ${ticket.buyer_cognome}`.trim() });
      }
    });
  };

  const handleUndoCheckIn = async (ticket: Ticket) => {
    const confirmed = await showConfirm({
      title: "Annullare il check-in?",
      message: `${ticket.buyer_nome} ${ticket.buyer_cognome} tornerà tra i partecipanti mancanti e il biglietto potrà essere nuovamente convalidato.`,
    });
    if (!confirmed) return;

    const previous = tickets;
    setTickets(current => current.map(item => item.id === ticket.id
      ? { ...item, status: "paid", used_at: null }
      : item));
    startTransition(async () => {
      const result = await undoCheckInTicket(ticket.id);
      if (result.error) {
        setTickets(previous);
        toast.error("Ripristino non riuscito", { description: result.error });
      } else {
        toast.success("Check-in annullato");
      }
    });
  };

  const handleResend = (ticket: Ticket) => {
    startTransition(async () => {
      const result = await resendTicketEmail(ticket.id);
      result.error
        ? toast.error("Invio non riuscito", { description: result.error })
        : toast.success("Email biglietto inviata", { description: ticket.buyer_email });
    });
  };

  return (
    <div className="space-y-6">
      <div className="admin-page-heading">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Partecipanti e ingressi</h1>
          <p className="mt-2 text-slate-500">Apri un evento per gestire i suoi iscritti, anche senza usare la fotocamera.</p>
        </div>
        <TicketScanner events={scannerEvents} logoUrl={logoUrl} onCheckIn={refreshAfterScan} />
      </div>

      <section className="grid grid-cols-3 gap-2 sm:gap-4" aria-label="Riepilogo complessivo">
        <SummaryCard icon={Users} label="Partecipanti" value={totals.participants} />
        <SummaryCard icon={UserCheck} label="Entrati" value={totals.entered} tone="green" />
        <SummaryCard icon={Clock3} label="Mancanti" value={totals.missing} tone="amber" />
      </section>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Cerca partecipante per nome, email o codice biglietto…"
          aria-label="Cerca partecipante"
          className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
        />
      </div>

      <div className="space-y-4">
        {eventGroups.map(group => {
          const isOpen = openEvents.has(group.event.id) || Boolean(normalizedQuery);
          const percentage = group.valid ? Math.round((group.entered / group.valid) * 100) : 0;
          return (
            <section key={group.event.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <button
                type="button"
                onClick={() => toggleEvent(group.event.id)}
                aria-expanded={isOpen}
                className="w-full p-4 text-left transition hover:bg-slate-50 sm:p-5"
              >
                <div className="flex items-start gap-3 sm:items-center">
                  <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-slate-950 text-white">
                    <CalendarDays className="size-4.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <h2 className="truncate font-semibold text-slate-950">{group.event.titolo}</h2>
                      {!group.event.attivo && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Non attivo</span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {new Date(group.event.data_inizio).toLocaleString("it-IT", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <div className="hidden items-center gap-5 sm:flex">
                    <EventMetric label="Iscritti" value={group.valid} />
                    <EventMetric label="Entrati" value={group.entered} accent />
                    <EventMetric label="Mancanti" value={group.missing} />
                  </div>
                  <ChevronDown className={`size-5 shrink-0 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 sm:hidden">
                  <EventMetric label="Iscritti" value={group.valid} />
                  <EventMetric label="Entrati" value={group.entered} accent />
                  <EventMetric label="Mancanti" value={group.missing} />
                </div>
                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${percentage}%` }} />
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-slate-100">
                  {group.tickets.length > 0 ? (
                    <div className="divide-y divide-slate-100">
                      {group.tickets.map(ticket => (
                        <ParticipantRow
                          key={ticket.id}
                          ticket={ticket}
                          pending={isPending}
                          onCheckIn={() => handleCheckIn(ticket)}
                          onUndo={() => handleUndoCheckIn(ticket)}
                          onResend={() => handleResend(ticket)}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="px-5 py-10 text-center">
                      <TicketCheck className="mx-auto size-7 text-slate-300" />
                      <p className="mt-3 text-sm font-medium text-slate-600">
                        {normalizedQuery ? "Nessun partecipante corrisponde alla ricerca." : "Nessun partecipante per questo evento."}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </section>
          );
        })}

        {eventGroups.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
            <Search className="mx-auto size-7 text-slate-300" />
            <p className="mt-3 font-medium text-slate-700">Nessun partecipante trovato</p>
            <p className="mt-1 text-sm text-slate-500">Prova con un altro nome, indirizzo email o codice.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ParticipantRow({
  ticket,
  pending,
  onCheckIn,
  onUndo,
  onResend,
}: {
  ticket: Ticket;
  pending: boolean;
  onCheckIn: () => void;
  onUndo: () => void;
  onResend: () => void;
}) {
  const fullName = `${ticket.buyer_nome || ""} ${ticket.buyer_cognome || ""}`.trim() || "Partecipante";
  return (
    <article className="grid gap-4 p-4 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] sm:items-center sm:px-5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate text-sm font-semibold text-slate-900">{fullName}</h3>
          <TicketStatus status={ticket.status} />
        </div>
        <a href={`mailto:${ticket.buyer_email}`} className="mt-1 block truncate text-xs text-slate-500 hover:text-slate-900">
          {ticket.buyer_email}
        </a>
        <p className="mt-1 truncate font-mono text-[10px] text-slate-400">{ticket.qr_code}</p>
      </div>

      <div>
        {ticket.custom_answers?.length ? (
          <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
            {ticket.custom_answers.map(answer => (
              <div key={answer.label} className="min-w-0">
                <dt className="inline font-medium text-slate-500">{answer.label}: </dt>
                <dd className="inline text-slate-700">{answer.value === true ? "Sì" : String(answer.value)}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <span className="text-xs text-slate-400">Nessun dato aggiuntivo</span>
        )}
      </div>

      <div className="flex items-center justify-end gap-2">
        {(ticket.status === "paid" || ticket.status === "used") && (
          <button
            type="button"
            onClick={onResend}
            disabled={pending}
            className="grid size-9 place-items-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
            title="Invia nuovamente il biglietto"
            aria-label={`Invia nuovamente il biglietto a ${fullName}`}
          >
            <Mail className="size-4" />
          </button>
        )}
        {ticket.status === "paid" && (
          <button
            type="button"
            onClick={onCheckIn}
            disabled={pending}
            className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-slate-950 px-3 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-40"
            title="Registra ingresso manualmente"
          >
            <Check className="size-3.5" /> Check-in
          </button>
        )}
        {ticket.status === "used" && (
          <button
            type="button"
            onClick={onUndo}
            disabled={pending}
            className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
            title="Annulla check-in"
          >
            <RotateCcw className="size-3.5" /> Ripristina
          </button>
        )}
      </div>
    </article>
  );
}

function TicketStatus({ status }: { status: Ticket["status"] }) {
  const styles = {
    used: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    paid: "bg-blue-50 text-blue-700 ring-blue-200",
    pending: "bg-amber-50 text-amber-700 ring-amber-200",
    refunded: "bg-rose-50 text-rose-700 ring-rose-200",
  };
  const labels = { used: "Entrato", paid: "Da accogliere", pending: "In attesa", refunded: "Rimborsato" };
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${styles[status]}`}>{labels[status]}</span>;
}

function EventMetric({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className={`rounded-lg px-2 py-1.5 text-center sm:min-w-16 ${accent ? "bg-emerald-50" : "bg-slate-50"}`}>
      <div className={`text-base font-bold tabular-nums ${accent ? "text-emerald-700" : "text-slate-800"}`}>{value}</div>
      <div className="text-[9px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  tone = "slate",
}: {
  icon: typeof Users;
  label: string;
  value: number;
  tone?: "slate" | "green" | "amber";
}) {
  const styles = {
    slate: "border-slate-200 bg-white text-slate-900",
    green: "border-emerald-200 bg-emerald-50 text-emerald-800",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
  };
  return (
    <div className={`rounded-xl border p-3 sm:p-4 ${styles[tone]}`}>
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide opacity-70 sm:text-xs">
        <Icon className="size-3.5 sm:size-4" /> {label}
      </div>
      <div className="mt-2 text-2xl font-bold tabular-nums sm:text-3xl">{value}</div>
    </div>
  );
}
