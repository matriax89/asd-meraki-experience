"use client";

import { useState, useTransition } from "react";
import { updateLeadStatus } from "@/app/api/admin/leads/actions";
import { DataTable } from "@/components/admin/data-table";

interface Lead {
  id: string;
  source: string;
  nome: string;
  cognome: string;
  email: string;
  telefono: string;
  interesse: string;
  messaggio: string;
  status: 'nuovo' | 'contattato' | 'convertito' | 'archiviato';
  created_at: string;
}

export function LeadsClient({ initialLeads }: { initialLeads: Lead[] }) {
  const [isPending, startTransition] = useTransition();
  const [optimisticLeads, setOptimisticLeads] = useState<Lead[]>(initialLeads);

  const handleStatusChange = (id: string, newStatus: string) => {
    // Optimistic update
    setOptimisticLeads(current => 
      current.map(lead => lead.id === id ? { ...lead, status: newStatus as any } : lead)
    );

    startTransition(async () => {
      await updateLeadStatus(id, newStatus as 'nuovo' | 'contattato' | 'convertito' | 'archiviato');
    });
  };

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'nuovo': return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'contattato': return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'convertito': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'archiviato': return 'bg-slate-100 text-slate-700 border-slate-200';
      default: return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  const columns = [
    {
      header: "Data",
      cell: (lead: Lead) => (
        <span className="text-slate-500 text-[13px] font-medium">
          {new Date(lead.created_at).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </span>
      )
    },
    {
      header: "Contatto",
      cell: (lead: Lead) => (
        <div>
          <p className="font-bold text-slate-900">{lead.nome} {lead.cognome}</p>
          <a href={`mailto:${lead.email}`} className="text-[13px] text-indigo-600 hover:text-indigo-800 transition-colors block">{lead.email}</a>
          {lead.telefono !== 'N/A' && <a href={`tel:${lead.telefono}`} className="text-[13px] text-slate-500 hover:text-slate-800 transition-colors block mt-0.5">{lead.telefono}</a>}
        </div>
      )
    },
    {
      header: "Sorgente",
      cell: (lead: Lead) => (
        <span className="capitalize text-[11px] font-bold tracking-wider bg-slate-100 text-slate-500 px-2.5 py-1 rounded-md">
          {lead.source.replace('_', ' ')}
        </span>
      )
    },
    {
      header: "Messaggio",
      cell: (lead: Lead) => (
        <div className="max-w-[250px] xl:max-w-[350px]">
          {lead.interesse && <span className="block text-[11px] font-bold text-indigo-500 uppercase tracking-widest mb-1">{lead.interesse}</span>}
          <p className="text-[13px] text-slate-600 truncate" title={lead.messaggio}>{lead.messaggio || '-'}</p>
        </div>
      )
    },
    {
      header: "Stato",
      cell: (lead: Lead) => (
        <div className="relative inline-block">
          <select
            value={lead.status}
            onChange={(e) => handleStatusChange(lead.id, e.target.value)}
            disabled={isPending}
            className={`text-[12px] font-bold px-3 py-1.5 rounded-xl border outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50 appearance-none cursor-pointer pr-8 uppercase tracking-widest transition-colors shadow-sm ${getStatusColor(lead.status)}`}
          >
            <option value="nuovo">Nuovo</option>
            <option value="contattato">Contattato</option>
            <option value="convertito">Iscritto</option>
            <option value="archiviato">Archiviato</option>
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-500">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
          </div>
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Leads & Richieste</h1>
          <p className="text-slate-500 mt-2">Gestisci le richieste di prova gratuita e i contatti dal sito.</p>
        </div>
      </div>

      <DataTable 
        data={optimisticLeads} 
        columns={columns} 
        keyExtractor={(lead) => lead.id} 
      />
    </div>
  );
}
