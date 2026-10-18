import { loadCommerceAdmin } from "@/app/api/admin/commerce/actions";
import { CommerceConfigEditor } from "@/components/admin/commerce-config-editor";
import { getLocalizedText } from "@/lib/i18n-utils";
import { Link } from "@/i18n/routing";

export default async function CommerceAdminPage({ params }: { params: Promise<{ id: string; locale: string }> }) {
  const { id, locale } = await params;
  const result = await loadCommerceAdmin(id);
  return <div className="min-w-0 space-y-6">
    <div><Link href={`/admin/eventi/${id}`} className="mb-4 inline-flex min-h-11 items-center text-sm font-semibold text-slate-500">← Torna all’evento</Link><h1 className="text-3xl font-bold tracking-tight text-slate-900">Formule, prezzi e vendite</h1>{result.success && <p className="mt-2 text-slate-500">{getLocalizedText(result.event.titolo, locale)}</p>}</div>
    {result.success ? <CommerceConfigEditor eventId={id} initialConfig={result.config} stats={result.stats} initialWaitlist={result.waitlist} /> : <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900">{result.error}</div>}
  </div>;
}
