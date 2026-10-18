"use client";

import { useState } from "react";
import { revealParticipantDocument } from "@/app/api/admin/participants/actions";
import type { ParticipantAdminRow } from "@/lib/commerce/participant-admin";

function ParticipantContact({ row }: { row: ParticipantAdminRow }) {
  const [documentNumber, setDocumentNumber] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function toggleDocument() {
    if (documentNumber) { setDocumentNumber(null); return; }
    setPending(true); setError("");
    try {
      const result = await revealParticipantDocument({ source: row.source, id: row.id });
      if (result.success) setDocumentNumber(result.documentNumber);
      else setError(result.error);
    } catch { setError("Documento non disponibile. Riprova."); }
    finally { setPending(false); }
  }
  return <article className="rounded-2xl border border-slate-200 bg-white p-5">
    <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-lg font-semibold text-slate-900">{row.firstName} {row.lastName}</h2><time className="text-xs text-slate-500" dateTime={row.createdAt}>{new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeZone: "Europe/Rome" }).format(new Date(row.createdAt))}</time></div>
    <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2"><div><dt className="text-slate-500">Email</dt><dd className="mt-1 break-all">{row.email}</dd></div><div><dt className="text-slate-500">Telefono</dt><dd className="mt-1">{row.phone}</dd></div><div className="sm:col-span-2"><dt className="text-slate-500">{row.documentLabel}</dt><dd className="mt-1 flex flex-wrap items-center gap-3"><span className="break-all font-mono">{documentNumber || row.maskedDocument}</span><button type="button" onClick={toggleDocument} disabled={pending} className="min-h-11 rounded-lg border border-slate-200 px-3 text-xs font-semibold disabled:opacity-50">{pending ? "Caricamento…" : documentNumber ? "Nascondi documento" : "Mostra documento"}</button></dd></div></dl>
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
  </article>;
}

export function ParticipantContacts({ rows }: { rows: ParticipantAdminRow[] }) {
  return <div className="grid gap-4">{rows.map(row => <ParticipantContact key={`${row.source}-${row.id}`} row={row}/>)}</div>;
}
