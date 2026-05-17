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
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

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
    },
    {
      header: "",
      cell: (lead: Lead) => (
        <button 
          onClick={() => setSelectedLead(lead)}
          className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors flex items-center justify-center"
          title="Vedi Dettagli"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        </button>
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

      {selectedLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setSelectedLead(null)}></div>
          <div className="relative bg-white rounded-[32px] shadow-[0_20px_40px_rgb(0,0,0,0.12)] w-full max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col animate-in fade-in zoom-in-95 duration-200 border border-slate-100">
            <div className="flex items-center justify-between p-6 md:p-8 border-b border-slate-100">
              <h2 className="text-2xl font-bold text-slate-900">Dettagli Richiesta</h2>
              <button onClick={() => setSelectedLead(null)} className="text-slate-400 hover:text-slate-900 p-2 rounded-full hover:bg-slate-100 transition-colors">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            
            <div className="p-6 md:p-8 space-y-8">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                <div>
                  <p className="text-[12px] font-bold text-slate-400 uppercase tracking-wider mb-2">Contatto</p>
                  <p className="text-lg font-bold text-slate-900">{selectedLead.nome} {selectedLead.cognome}</p>
                  <a href={`mailto:${selectedLead.email}`} className="text-[15px] font-medium text-indigo-600 hover:text-indigo-800 transition-colors block mt-1">{selectedLead.email}</a>
                  {selectedLead.telefono !== 'N/A' && <a href={`tel:${selectedLead.telefono}`} className="text-[15px] text-slate-600 hover:text-slate-900 transition-colors block mt-1">{selectedLead.telefono}</a>}
                </div>
                <div>
                  <p className="text-[12px] font-bold text-slate-400 uppercase tracking-wider mb-2">Data e Sorgente</p>
                  <p className="text-[15px] font-medium text-slate-900 mb-2">
                    {new Date(selectedLead.created_at).toLocaleString('it-IT')}
                  </p>
                  <span className="inline-block capitalize text-[12px] font-bold tracking-wider bg-slate-100 text-slate-600 px-3 py-1.5 rounded-lg border border-slate-200">
                    {selectedLead.source.replace('_', ' ')}
                  </span>
                </div>
              </div>

              <div>
                <p className="text-[12px] font-bold text-slate-400 uppercase tracking-wider mb-3">Interesse</p>
                <span className="inline-flex text-[14px] font-bold text-indigo-700 bg-indigo-50 px-4 py-2 rounded-xl border border-indigo-100/50">
                  {selectedLead.interesse || "Generico"}
                </span>
              </div>

              <div>
                <p className="text-[12px] font-bold text-slate-400 uppercase tracking-wider mb-3">Messaggio dell'utente</p>
                <div className="bg-slate-50 border border-slate-100/80 rounded-2xl p-6 shadow-inner">
                  <p className="text-[15px] text-slate-700 leading-relaxed whitespace-pre-wrap font-medium">
                    {selectedLead.messaggio || <span className="italic text-slate-400 font-normal">Nessun messaggio inserito.</span>}
                  </p>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100">
                <p className="text-[12px] font-bold text-slate-400 uppercase tracking-wider mb-3">Cambia Stato</p>
                <div className="relative inline-block">
                  <select
                    value={selectedLead.status}
                    onChange={(e) => {
                      handleStatusChange(selectedLead.id, e.target.value);
                      setSelectedLead({ ...selectedLead, status: e.target.value as any });
                    }}
                    disabled={isPending}
                    className={`text-[14px] font-bold px-5 py-3 rounded-xl border outline-none focus:ring-4 focus:ring-indigo-500/20 disabled:opacity-50 appearance-none cursor-pointer pr-12 uppercase tracking-widest transition-all duration-200 shadow-sm ${getStatusColor(selectedLead.status)}`}
                  >
                    <option value="nuovo">Nuovo</option>
                    <option value="contattato">Contattato</option>
                    <option value="convertito">Iscritto</option>
                    <option value="archiviato">Archiviato</option>
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
