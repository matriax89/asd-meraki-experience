"use client";

import { useState, useTransition } from "react";
import { checkInTicket } from "@/app/api/admin/biglietti/actions";
import { DataTable } from "@/components/admin/data-table";

interface Ticket {
  id: string;
  event_id: string;
  buyer_nome: string;
  buyer_cognome: string;
  buyer_email: string;
  qr_code: string;
  status: 'pending' | 'paid' | 'used' | 'refunded';
  used_at: string | null;
  events: {
    titolo: string;
    data_inizio: string;
  };
}

export function TicketsClient({ initialTickets }: { initialTickets: Ticket[] }) {
  const [isPending, startTransition] = useTransition();
  const [optimisticTickets, setOptimisticTickets] = useState<Ticket[]>(initialTickets);

  const handleCheckIn = (id: string) => {
    // Optimistic update
    setOptimisticTickets(current => 
      current.map(t => t.id === id ? { ...t, status: 'used', used_at: new Date().toISOString() } : t)
    );

    startTransition(async () => {
      await checkInTicket(id);
    });
  };

  const columns = [
    {
      header: "Acquirente",
      cell: (ticket: Ticket) => (
        <div>
          <span className="block font-bold text-slate-900">{ticket.buyer_nome} {ticket.buyer_cognome}</span>
          <span className="block text-[13px] text-slate-500 mt-0.5">{ticket.buyer_email}</span>
        </div>
      )
    },
    {
      header: "Evento",
      cell: (ticket: Ticket) => (
        <div>
          <span className="block font-bold text-slate-900">{ticket.events?.titolo || 'Sconosciuto'}</span>
          <span className="block text-[13px] text-slate-500 mt-0.5">
            {ticket.events?.data_inizio ? new Date(ticket.events.data_inizio).toLocaleDateString('it-IT') : ''}
          </span>
        </div>
      )
    },
    {
      header: "QR Code",
      cell: (ticket: Ticket) => <span className="font-mono text-[11px] bg-slate-100 text-slate-600 px-2 py-1 rounded">{ticket.qr_code}</span>
    },
    {
      header: "Stato",
      cell: (ticket: Ticket) => {
        if (ticket.status === 'used') return <span className="px-2.5 py-1 bg-slate-100 text-slate-600 border border-slate-200 rounded-lg text-[11px] font-bold uppercase tracking-wider">Usato</span>;
        if (ticket.status === 'paid') return <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-[11px] font-bold uppercase tracking-wider">Valido (Pagato)</span>;
        if (ticket.status === 'pending') return <span className="px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-[11px] font-bold uppercase tracking-wider">In attesa</span>;
        if (ticket.status === 'refunded') return <span className="px-2.5 py-1 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg text-[11px] font-bold uppercase tracking-wider">Rimborsato</span>;
        return <span className="px-2.5 py-1 bg-slate-100 text-slate-600 border border-slate-200 rounded-lg text-[11px] font-bold uppercase tracking-wider">{ticket.status}</span>;
      }
    },
    {
      header: "Azioni",
      cell: (ticket: Ticket) => {
        if (ticket.status === 'paid') {
          return (
            <button 
              onClick={() => handleCheckIn(ticket.id)}
              disabled={isPending}
              className="bg-slate-900 text-white hover:bg-slate-800 px-4 py-2 rounded-xl text-[12px] font-bold uppercase tracking-widest disabled:opacity-50 transition-all active:scale-95 shadow-sm hover:shadow"
            >
              Check-in
            </button>
          );
        }
        if (ticket.status === 'used') {
          return (
            <span className="text-[12px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
              <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
              {ticket.used_at ? new Date(ticket.used_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : ''}
            </span>
          );
        }
        return <span className="text-xs text-muted-foreground">-</span>;
      }
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Biglietti Eventi</h1>
          <p className="text-slate-500 mt-2">Gestisci ingressi e check-in dei partecipanti agli eventi.</p>
        </div>
      </div>

      <DataTable 
        data={optimisticTickets} 
        columns={columns} 
        keyExtractor={(ticket) => ticket.id} 
      />
    </div>
  );
}
