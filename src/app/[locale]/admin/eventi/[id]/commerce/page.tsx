import { loadCommerceAdmin } from "@/app/api/admin/commerce/actions";
import { CommerceConfigEditor } from "@/components/admin/commerce-config-editor";
import { getLocalizedText } from "@/lib/i18n-utils";
import { Link } from "@/i18n/routing";

export default async function CommerceAdminPage({ params }: { params: Promise<{ id: string; locale: string }> }) {
  const { id, locale } = await params;
  const result = await loadCommerceAdmin(id);
  return <div className="min-w-0 space-y-6">
    <div><Link href={`/admin/eventi/${id}?ticketing=advanced`} className="mb-4 inline-flex min-h-11 items-center text-sm font-semibold text-slate-500">← Dettagli dell’evento</Link><h1 className="text-3xl font-bold tracking-tight text-slate-900">Configura i biglietti</h1>{result.success && <p className="mt-2 text-slate-500">{getLocalizedText(result.event.titolo, locale)}</p>}</div>
    {result.success && <nav aria-label="Gestione dell’evento" className="flex flex-wrap gap-3"><Link href={`/admin/biglietti?event=${id}`} className="inline-flex min-h-11 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700">Partecipanti e check-in</Link>{result.event.attivo && <Link href={`/${result.event.tipo === "evento" ? "eventi" : "workshop"}/${result.event.slug}`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700">Apri pagina pubblica ↗</Link>}</nav>}
    {result.success ? <CommerceConfigEditor eventId={id} initialConfig={result.config} stats={result.stats} initialWaitlist={result.waitlist} isPublished={Boolean(result.event.attivo)} /> : <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900">{result.error}</div>}
  </div>;
}
