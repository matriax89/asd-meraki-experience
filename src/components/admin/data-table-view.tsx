"use client";

import { useDeferredValue, useId, useMemo, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Search, Table2, X } from "lucide-react";
import { CustomSelect } from "@/components/ui/custom-select";

export type AdminTableRow = { id: string; cells: ReactNode[]; searchText: string };
type AdminTableColumn = { header: string; align?: "left" | "center" | "right" };
const alignClass = (align?: string) => align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
const normalized = (value: string) => value.normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export function DataTableView({ rows, columns, caption = "Elenco", searchPlaceholder = "Cerca nell’elenco…", initialPageSize = 25, searchable = true }: {
  rows: AdminTableRow[]; columns: AdminTableColumn[]; caption?: string; searchPlaceholder?: string; initialPageSize?: number; searchable?: boolean;
}) {
  const searchId = useId();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const deferredSearch = useDeferredValue(search);
  const filtered = useMemo(() => { const query = normalized(deferredSearch.trim()); return query ? rows.filter(row => normalized(row.searchText).includes(query)) : rows; }, [rows, deferredSearch]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const start = (currentPage - 1) * pageSize;
  const visible = filtered.slice(start, start + pageSize);
  return <section aria-label={caption} className="min-w-0 overflow-hidden rounded-[20px] border border-[#dce3d5] bg-white shadow-[0_2px_8px_#1b382205]">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e6eadf] p-4">
      {searchable ? <label htmlFor={searchId} className="relative flex min-w-0 flex-1 items-center gap-2 sm:max-w-sm"><Search size={16} className="pointer-events-none absolute left-3 text-[#617055]" aria-hidden="true"/><span className="sr-only">{searchPlaceholder}</span><input id={searchId} type="search" placeholder={searchPlaceholder} value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} className="w-full rounded-xl border border-[#e2e7d8] bg-[#fafbf7] py-2.5 pl-9 pr-9 text-sm"/>{search ? <button type="button" aria-label="Cancella ricerca" onClick={() => { setSearch(""); setPage(1); }} className="absolute right-1 grid h-9 w-8 place-items-center rounded-lg text-[#617055]"><X size={15}/></button> : null}</label> : null}
      <div className="flex items-center gap-2 text-xs text-[#617055]" aria-live="polite"><Table2 size={14} aria-hidden="true"/><span>{filtered.length.toLocaleString("it-IT")} {filtered.length === 1 ? "risultato" : "risultati"}{filtered.length !== rows.length ? ` su ${rows.length.toLocaleString("it-IT")}` : ""}</span></div>
    </div>
    <div className="max-w-full overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">{caption}</caption><thead className="border-b border-[#e4e8db] bg-[#f7f9f3]"><tr>{columns.map((column, index) => <th key={index} scope="col" className={`whitespace-nowrap px-5 py-3.5 text-[10px] font-semibold uppercase tracking-[.09em] text-[#617055] ${alignClass(column.align)}`}>{column.header}</th>)}</tr></thead><tbody className="divide-y divide-[#edf0e7]">{visible.length ? visible.map(row => <tr key={row.id} className="transition-colors hover:bg-[#f8faf4]">{row.cells.map((cell, index) => <td key={index} className={`px-5 py-4 align-middle text-[#506149] ${alignClass(columns[index]?.align)}`}>{cell}</td>)}</tr>) : <tr><td colSpan={Math.max(1, columns.length)} className="px-6 py-14 text-center text-sm text-[#617055]">{rows.length ? "Nessun risultato per questa ricerca." : "Non ci sono ancora dati da mostrare."}</td></tr>}</tbody></table></div>
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e6eadf] px-4 py-3 text-xs text-[#617055]"><span>{filtered.length ? `${start + 1}–${Math.min(start + pageSize, filtered.length)} di ${filtered.length}` : "0 risultati"}</span><div className="flex items-center gap-3"><label className="flex items-center gap-2"><span className="hidden sm:inline">Per pagina</span><CustomSelect aria-label="Risultati per pagina" value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }} className="min-w-20 text-xs">{[10, 25, 50, 100].map(value => <option key={value} value={value}>{value}</option>)}</CustomSelect></label><div className="flex items-center gap-1"><button type="button" aria-label="Pagina precedente" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)} className="grid h-10 w-10 place-items-center rounded-lg border border-[#e2e7d9] text-[#567047] disabled:opacity-35"><ChevronLeft size={16}/></button><span className="min-w-14 text-center" aria-live="polite">{currentPage} / {pageCount}</span><button type="button" aria-label="Pagina successiva" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)} className="grid h-10 w-10 place-items-center rounded-lg border border-[#e2e7d9] text-[#567047] disabled:opacity-35"><ChevronRight size={16}/></button></div></div></div>
  </section>;
}
