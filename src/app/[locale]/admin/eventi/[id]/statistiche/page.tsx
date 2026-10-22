import { AnalyticsDashboard } from "@/components/admin/analytics-dashboard";
import { loadAdminAnalytics } from "@/lib/admin/analytics";
import type { AdminAnalyticsInput } from "@/lib/admin/analytics-types";

type Query = { period?: string | string[]; from?: string | string[]; to?: string | string[]; affiliate?: string | string[] };
const value = (entry: string | string[] | undefined) => typeof entry === "string" ? entry : entry === undefined ? undefined : "invalid";

export default async function EventStatisticsPage({ params, searchParams }: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<Query>;
}) {
  const [{ locale, id }, query] = await Promise.all([params, searchParams]);
  let data;
  try {
    data = await loadAdminAnalytics({ locale, eventId: id, period: value(query.period) as AdminAnalyticsInput["period"], from: value(query.from), to: value(query.to), affiliateId: value(query.affiliate) });
  } catch {
    return <section className="space-y-3"><h1 className="text-2xl font-semibold text-[#263f2e]">Statistiche evento</h1><p role="alert" className="rounded-xl border border-[#e5d9bb] bg-[#faf6e9] p-4 text-sm leading-6 text-[#83714b]">Impossibile caricare le statistiche. Verifica l’accesso, l’evento e i filtri selezionati, poi ricarica la pagina. Nessun dato parziale viene mostrato.</p></section>;
  }
  return <AnalyticsDashboard key={JSON.stringify(data.filters)} data={data} fixedEventId={id} />;
}
